import Anthropic from "@anthropic-ai/sdk";
import { callAI } from "./aiGateway.mjs";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import expressions from "angular-expressions";
import { config as dotenvConfig } from "dotenv";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth } from "./requireAuth.mjs";
import { ok, err, rowToCamel, translateDbError } from "./apiResponse.mjs";
import { normaliseAddress } from "./addressNormalise.mjs";
import { setFact } from "./factsService.mjs";
import { recomputeReferralRollup } from "./crmRoutes.mjs";
import { insertLeadCreatedActivity } from "./leadActivities.mjs";
import { normalizeLeadSourceCategory, isValidLeadSourceCategory } from "./leadSourceCategory.mjs";
import { deriveActionForStage, isValidActionType } from "./leadActionQueue.mjs";
import { geocodeToFacts } from "./geocodeService.mjs";
import { enrichSite } from "./siteEnrichmentService.mjs";
import {
  dropboxConfigured,
  ensureJobFolderStructure,
  backfillLeadDataToJobFolder,
} from "./dropboxClient.mjs";

// Stages at qualify or beyond where a lead justifies a full address geocode.
const _GEO_QUALIFY_PLUS = new Set([
  "qualify", "discovery", "winning_offer", "fee_proposal", "accepted", "tender", "won",
]);

// W01-DRIFT-003 (SAM-W02-002): stage gates are ADVISORY during hardening — never
// hard-blocked server-side, but a bypass is logged + surfaced (non-breaking) so it is
// observable. Mirror of the frontend GATE_REQUIREMENTS in LeadDetail.jsx.
const STAGE_GATES = {
  discovery:     [{ label: "Qualifying score ≥ 5",      check: l => (l.qualify_score || 0) >= 5 }],
  winning_offer: [
    { label: "Discovery notes filled",  check: l => !!l.discovery_notes?.trim() },
    { label: "Design stage set",        check: l => !!l.design_stage },
    { label: "Desired start date set",  check: l => !!l.desired_start_date },
  ],
  fee_proposal:  [{ label: "Pre-construction fee set",  check: l => l.preconstruction_fee != null }],
  tender:        [
    { label: "Site address set",        check: l => !!l.site_address?.trim() },
    { label: "Job created from lead",   check: l => !!l.job_id },
  ],
};

function evaluateStageGate(targetStage, mergedLead) {
  const gates = STAGE_GATES[targetStage] || [];
  return gates.filter(g => !g.check(mergedLead)).map(g => g.label);
}

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Blueprint-agent knowledge directory (sibling project)
const KNOWLEDGE_DIR = join(__dirname, "../../../blueprint-agent/src/blueprint/knowledge");

const { parsed: _env = {} } = dotenvConfig();
const _apiKey = process.env.ANTHROPIC_API_KEY?.trim() || _env.ANTHROPIC_API_KEY?.trim();
const CLAUDE_MODEL = _env.CLAUDE_MODEL || process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

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
    "floor_area_estimate": null,
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
- floor_area_estimate must be a number — or null
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

  const response = await callAI(client, {
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    temperature: 0.1,
    messages: [
      {
        role: "user",
        content: `${TRANSCRIPT_ANALYSIS_PROMPT}\n${contextBlock}\n\nTRANSCRIPT:\n${transcript}`
      }
    ]
  }, { module: "salesRoutes" });

  const raw = response.content.find(b => b.type === "text")?.text?.trim() || "";
  // Strip markdown code fences if present
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    throw new Error(`Blueprint returned non-JSON: ${raw.slice(0, 200)}`);
  }
}

// ── Winning Offer — Blueprint coaching context block ─────────────────────────
export function buildWinningOfferBlueprintAppend(lead) {
  if (!lead || lead.stage !== "winning_offer") return "";
  return `

--- WINNING OFFER CONTEXT ---
Client vision: ${lead.wo_client_vision || "not recorded"}
Budget confirmed: ${lead.wo_budget_confirmed || "not confirmed"}
Timeline: ${lead.wo_timeline_confirmed || "not confirmed"}
Decision makers: ${lead.wo_decision_makers || "not recorded"}
Most excited about: ${lead.wo_most_excited_about || "not recorded"}
Biggest concern: ${lead.wo_biggest_concern || "not recorded"}

INTERNAL — do not share directly with client:
Other builders they're comparing: ${lead.wo_other_builders || "unknown"}
Why Blue Leaf wins this: ${lead.wo_our_differentiator || "not recorded"}

At this stage, coaching should be specific to the concerns and context above.
APB objection-handling principles to apply when relevant:
- Price higher than competitors → reframe: cost of risk with a cheaper builder
- "Need more time to think" → what does delay cost their timeline?
- "Still getting other quotes" → PTSA doesn't prevent comparing, it starts the work
- "Can you reduce the PTSA fee?" → the fee funds the work that gives them a 
  price they can trust — it protects them, not us
---`;
}

// ── APB stage probability weights ────────────────────────────────────────────
// APB stage probability weights — sourced from APB Pricing 4 Profit framework
const STAGE_PROB = {
  enquiry: 0.05, qualify: 0.10, discovery: 0.20,
  winning_offer: 0.35, fee_proposal: 0.50,
  accepted: 0.65, tender: 0.80, won: 1.00
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

/**
 * Convert a lead into a job (server-side, non-lossy, provenance-stamped).
 *
 * Extracted verbatim from POST /api/sales/leads/:id/convert-to-job so the same
 * side-effects can run from the PTSA mark-signed orchestration. PRESERVES EVERY
 * side-effect: dedup by address_normalised then raw ilike, the setFact provenance
 * loop, the CRM contact link, the referrer role + recomputeReferralRollup, and
 * linking job_id back onto the lead. NO Dropbox side-effects here (the original
 * route had none — folder provisioning is owned by PTSA-signed / job creation).
 *
 * @param {object} sb — service-role Supabase client
 * @param {object} lead — the full lead row (snake_case)
 * @param {string|null} actorId — caller id for provenance, or null
 * @returns {Promise<{ job: object, alreadyConverted?: boolean, stampedFacts?: string[] }>}
 * @throws {Error} with `.httpStatus`/`.publicMessage` for caller-mappable failures.
 */
export async function convertLeadToJob(sb, lead, actorId = null) {
  // 1. Already converted — return the existing job (idempotent).
  if (lead.job_id) {
    const { data: existingJob } = await sb.from("jobs").select("*").eq("id", lead.job_id).maybeSingle();
    if (existingJob) return { job: existingJob, alreadyConverted: true };
  }

  // 2. Require a real site address — the "Name — Suburb" fallback produces an unmatchable
  //    address that orphans the job from Operations and Finance selectors. (BUG-010)
  if (!lead.site_address?.trim()) {
    const e = new Error("A site address is required before creating a project. Please add the site address to the lead first.");
    e.httpStatus = 400;
    e.publicMessage = e.message;
    throw e;
  }

  // Resolve the canonical address + client name. Prefer the full-name field (leads.name) so a
  // compound client ("Jess Parken & Rick Lockwood") survives — first+last is only one person.
  // Keeps both creation paths (RFQ vs conversion) deriving the identical client_name.
  const clientName = (lead.name && lead.name.trim()) || `${lead.first_name || ""} ${lead.last_name || ""}`.trim();
  const rawAddress = lead.site_address.trim();
  const addr = normaliseAddress(rawAddress);

  // 3. Dedup exactly like POST /api/jobs: prefer the normalised key, then raw ilike.
  let job = null;
  if (addr.normalised) {
    const { data } = await sb.from("jobs").select("*").eq("address_normalised", addr.normalised).limit(1);
    job = data?.[0] || null;
  }
  if (!job) {
    const { data } = await sb.from("jobs").select("*").ilike("address", rawAddress).limit(1);
    job = data?.[0] || null;
  }

  // 4. Create the job if no match (same column shape + inline normalisation as POST /api/jobs).
  if (!job) {
    const { data: created, error: insErr } = await sb.from("jobs").insert({
      address: rawAddress,
      address_normalised: addr.normalised,
      address_suburb: addr.suburb,
      address_state: addr.state,
      address_postcode: addr.postcode,
      client_name: clientName || null,
      client_email: lead.email?.trim() || null,
      client_phone: lead.phone?.trim() || null,
      project_type: lead.project_type || null,
      lead_id: lead.id,
      // Derive status from lead stage: a won lead → won job; everything else → tendering.
      // Valid job statuses (migration 001 CHECK): tendering | won | lost | archived.
      status: lead.stage === "won" ? "won" : "tendering",
    }).select().single();
    if (insErr) {
      const e = new Error(translateDbError(insErr));
      e.httpStatus = 400;
      e.publicMessage = e.message;
      throw e;
    }
    job = created;
  }

  // 5. Stamp each carried lead fact via the facts service (provenance = the lead).
  //    The address fact's Phase-1 hook derives suburb/postcode/state — we never
  //    write those ourselves. Skipped if the value is empty. setFact failures are
  //    non-fatal (the job already exists) — logged so the conversion still returns.
  const carry = [
    ["address", rawAddress],
    ["client_name", clientName || null],
    ["client_email", lead.email?.trim() || null],
    ["client_phone", lead.phone?.trim() || null],
    ["project_type", lead.project_type || null],
    ["architect_name", lead.architect_name?.trim() || null],
    // Lead's deal-value estimate → job estimate fact. NOT original_contract_value
    // (Phase 5 sets that at WIN from the accepted proposal).
    ["estimated_value", lead.estimated_value != null ? Number(lead.estimated_value) : null],
  ];
  const stamped = [];
  for (const [key, value] of carry) {
    if (value === null || value === undefined || value === "") continue;
    const r = await setFact(job.id, key, value, {
      source: "system",
      reason: "lead_conversion",
      actorId,
    });
    if (r?.ok) stamped.push(key);
    else console.warn(`[convert-to-job] setFact ${key}:`, r?.error);
  }

  // 6. Link the lead to the new job (so the UI/CRM read the job).
  await sb.from("leads").update({ job_id: job.id, updated_at: new Date().toISOString() }).eq("id", lead.id);

  // 7. Link the matching CRM contact to the job (by lead linkage, else by email).
  try {
    let contact = null;
    const { data: byLead } = await sb.from("crm_contacts").select("id").eq("converted_lead_id", lead.id).limit(1);
    contact = byLead?.[0] || null;
    if (!contact && lead.email?.trim()) {
      const { data: byEmail } = await sb.from("crm_contacts").select("id").ilike("email", lead.email.trim()).limit(1);
      contact = byEmail?.[0] || null;
    }
    if (contact) {
      await sb.from("crm_contacts")
        .update({ linked_job_id: job.id, updated_at: new Date().toISOString() })
        .eq("id", contact.id);
    }
  } catch (e) {
    console.warn("[convert-to-job] crm link:", e?.message || e);
  }

  // 7b. Close the referral loop: if this lead was referred by a CRM contact,
  //     materialise a 'referrer' role on the Party spine (credits_referral=true,
  //     so it credits the new job's contract value as "value brought in"), then
  //     recompute that referrer's rollup. Idempotent via the UNIQUE(job_id,
  //     contact_id, role) constraint. Additive + NON-FATAL — a failure here must
  //     never break the conversion (the job already exists).
  if (lead.referred_by_contact_id) {
    try {
      // upsert-style: the UNIQUE(job_id, contact_id, role) constraint makes a
      // re-convert a no-op rather than a duplicate. We swallow the duplicate-key
      // error and still recompute below so the rollup stays correct.
      const { error: roleErr } = await sb.from("job_contact_roles").insert({
        job_id: job.id,
        lead_id: lead.id,
        contact_id: lead.referred_by_contact_id,
        role: "referrer",
        status: "active",
        credits_referral: true,
        created_by: actorId,
      });
      if (roleErr && !/duplicate key|unique constraint/i.test(String(roleErr.message || roleErr))) {
        console.warn("[convert-to-job] referrer role insert:", roleErr.message || roleErr);
      }
      await recomputeReferralRollup(sb, lead.referred_by_contact_id);
    } catch (e) {
      console.warn("[convert-to-job] referrer role:", e?.message || e);
    }
  }

  // 8. Re-read the job so the response reflects any applied fact writes.
  const { data: fresh } = await sb.from("jobs").select("*").eq("id", job.id).maybeSingle();
  return { job: fresh || job, stampedFacts: stamped };
}

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

  // ── Batch 1B: unified timeline (read-only v_lead_timeline) ─────────────────
  // One stream across activities, notes, conversations, CRM interactions and email
  // opens/clicks. Degrades softly to an empty stream if migration 128 isn't applied
  // yet, so the Lead Detail page never hard-fails in production before the paste.
  app.get("/api/sales/leads/:id/timeline", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const { data, error } = await sb
      .from("v_lead_timeline")
      .select("*")
      .eq("lead_id", req.params.id)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (error) {
      // 42P01 = undefined_table/view — migration 128 not applied yet.
      if (error.code === "42P01") return ok(res, { timeline: [], viewMissing: true });
      return err(res, 400, translateDbError(error));
    }
    ok(res, { timeline: (data || []).map(rowToCamel) });
  });

  // ── Batch 1B: lead_signals (objections / fears / priorities) ───────────────
  const SIGNAL_KINDS = ["objection", "fear", "priority"];
  const SIGNAL_STATUSES = ["open", "addressed"];

  app.get("/api/sales/leads/:id/signals", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { data, error } = await sb
      .from("lead_signals")
      .select("*")
      .eq("lead_id", req.params.id)
      .order("created_at", { ascending: true });
    if (error) {
      if (error.code === "42P01") return ok(res, { signals: [], tableMissing: true });
      return err(res, 400, translateDbError(error));
    }
    ok(res, { signals: (data || []).map(rowToCamel) });
  });

  app.post("/api/sales/leads/:id/signals", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { kind, label, detail } = req.body || {};
    if (!SIGNAL_KINDS.includes(kind)) return err(res, 400, "kind must be objection, fear or priority.");
    if (!label || !String(label).trim()) return err(res, 400, "label is required.");
    const row = { lead_id: req.params.id, kind, label: String(label).trim(), detail: detail || null };
    const { data, error } = await sb.from("lead_signals").insert(row).select().single();
    if (error) return err(res, 400, translateDbError(error));
    ok(res, { signal: rowToCamel(data) });
  });

  app.patch("/api/sales/leads/:id/signals/:signalId", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const patch = { updated_at: new Date().toISOString() };
    if (req.body?.status !== undefined) {
      if (!SIGNAL_STATUSES.includes(req.body.status)) return err(res, 400, "status must be open or addressed.");
      patch.status = req.body.status;
    }
    if (req.body?.label !== undefined) patch.label = String(req.body.label).trim();
    if (req.body?.detail !== undefined) patch.detail = req.body.detail || null;
    const { data, error } = await sb
      .from("lead_signals")
      .update(patch)
      .eq("id", req.params.signalId)
      .eq("lead_id", req.params.id)
      .select()
      .single();
    if (error) return err(res, 400, translateDbError(error));
    ok(res, { signal: rowToCamel(data) });
  });

  app.delete("/api/sales/leads/:id/signals/:signalId", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { error } = await sb
      .from("lead_signals")
      .delete()
      .eq("id", req.params.signalId)
      .eq("lead_id", req.params.id);
    if (error) return err(res, 400, translateDbError(error));
    ok(res);
  });

  app.post("/api/sales/leads", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const now = new Date().toISOString();
    const body = req.body;
    if (body.first_name) body.first_name = body.first_name.trim().replace(/\b\w/g, c => c.toUpperCase());
    if (body.last_name) body.last_name = body.last_name.trim().replace(/\b\w/g, c => c.toUpperCase());

    // CRM Control Spine (migration 127): every lead must have a lead_source_category. Prefer an
    // explicit value; else derive it from lead_source (the existing picklist already maps cleanly).
    // Only reject if neither resolves — never blocks a well-formed create.
    if (body.lead_source_category) {
      if (!isValidLeadSourceCategory(body.lead_source_category)) {
        return res.status(400).json({ ok: false, error: "Invalid lead_source_category." });
      }
    } else {
      const derived = normalizeLeadSourceCategory(body.lead_source);
      if (!derived) return res.status(400).json({ ok: false, error: "lead_source_category is required (or a lead_source we can classify)." });
      body.lead_source_category = derived;
    }

    const insert = { ...body, created_at: now, updated_at: now, stage: body.stage || "enquiry", stage_entered_at: now, last_activity_at: now };
    const { data, error } = await sb.from("leads").insert(insert).select().single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    await insertLeadCreatedActivity(sb, data.id);
    // G0-B: geocode at suburb precision on lead create (cost control — early leads only need
    // map-bubble placement; full address deferred until qualify+). Non-blocking, fail-soft.
    const _createSuburb = String(data.suburb || "").trim();
    const _createAddr   = String(data.site_address || "").trim();
    if (_createSuburb || _createAddr) {
      geocodeToFacts("leads", data.id, _createSuburb || _createAddr, "suburb").catch(() => {});
    }
    res.json({ ok: true, lead: data });
  });

  app.patch("/api/sales/leads/:id", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const body = req.body;
    // The signed PTSA state is owned solely by POST /api/sales/leads/:id/ptsa/mark-signed,
    // which stores the signed PDF + provisions the job folder. Block the blanket PATCH from
    // setting it directly so those side-effects can never be bypassed.
    if (body.ptsa_status === "signed") {
      return err(res, 400, "Use POST /api/sales/leads/:id/ptsa/mark-signed to mark a PTSA signed (it stores the signed PDF and provisions the job folder).");
    }
    if (body.first_name) body.first_name = body.first_name.trim().replace(/\b\w/g, c => c.toUpperCase());
    if (body.last_name) body.last_name = body.last_name.trim().replace(/\b\w/g, c => c.toUpperCase());

    // CRM Control Spine (migration 127) — validate the new fields. Build 1A is manual-only: fit
    // and action fields are set by hand here, never inferred/overwritten by AI.
    if (body.fit_quality !== undefined && body.fit_quality !== null && !["strong", "possible", "nurture", "poor", "price_shopper"].includes(body.fit_quality)) {
      return err(res, 400, "Invalid fit_quality.");
    }
    if (body.readiness !== undefined && body.readiness !== null && !["early_research", "not_ready_yet", "ready_for_consult"].includes(body.readiness)) {
      return err(res, 400, "Invalid readiness.");
    }
    if (body.action_type !== undefined && body.action_type !== null && !isValidActionType(body.action_type)) {
      return err(res, 400, "Invalid action_type.");
    }
    if (body.lead_source_category !== undefined && body.lead_source_category !== null && !isValidLeadSourceCategory(body.lead_source_category)) {
      return err(res, 400, "Invalid lead_source_category.");
    }
    const fitChanged = "fit_quality" in body || "readiness" in body;

    const updates = { ...body, updated_at: new Date().toISOString() };
    if (fitChanged) {
      updates.fit_set_by = req.caller?.id || null;
      updates.fit_set_at = new Date().toISOString();
    }
    const { data: current } = await sb
      .from("leads")
      .select("stage, won_at, lost_at, qualify_score, discovery_notes, design_stage, desired_start_date, preconstruction_fee, site_address, suburb, job_id, geo_geocoded_at, geo_precision")
      .eq("id", req.params.id)
      .single();
    let gateWarnings = [];
    if (updates.stage && current?.stage && updates.stage !== current.stage) {
      const outcomeDate = new Date().toISOString().slice(0, 10);
      updates.stage_entered_at = new Date().toISOString();
      updates.last_activity_at = new Date().toISOString();
      if (updates.stage === "won" && !current.won_at) {
        updates.won_at = outcomeDate;
      }
      if (updates.stage === "lost" && !current.lost_at) {
        updates.lost_at = outcomeDate;
      }
      // Rule-based action-queue default (plan §5) — only fills the gap when this same request
      // didn't already set an explicit action_type, so a human choice is never overridden.
      if (!("action_type" in body)) {
        const defaults = deriveActionForStage(updates.stage);
        if (defaults) { updates.action_type = defaults.action_type; updates.action_due_at = defaults.action_due_at; }
        else { updates.action_type = null; updates.action_due_at = null; }
      }
      // W01-DRIFT-003 (SAM-W02-002): advisory gate check — log + surface, never block.
      gateWarnings = evaluateStageGate(updates.stage, { ...current, ...updates });
      if (gateWarnings.length) {
        console.warn(`[gate-bypass] lead ${req.params.id} ${current.stage}→${updates.stage} missing: ${gateWarnings.join("; ")}`);
      }
      await sb.from("lead_activities").insert({
        lead_id: req.params.id,
        activity_type: "stage_change",
        summary: `Moved from ${current.stage} to ${updates.stage}`,
        detail: gateWarnings.length ? `Gate bypass — missing: ${gateWarnings.join("; ")}` : null
      });
    }
    const { data, error } = await sb.from("leads").update(updates).eq("id", req.params.id).select().single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    // Batch 1C — on win, snapshot the realised value onto enquiry_attribution so the ROI
    // view has a durable won_value (independent of later job/proposal edits). Best-effort:
    // silently skipped if migration 130's columns aren't applied yet.
    if (updates.won_at && data?.stage === "won") {
      try {
        let wonValue = data.estimated_value != null ? Number(data.estimated_value) : null;
        if (data.job_id) {
          const { data: job } = await sb.from("jobs").select("contract_value").eq("id", data.job_id).maybeSingle();
          if (job?.contract_value != null) wonValue = Number(job.contract_value);
        }
        await sb.from("enquiry_attribution").upsert(
          { lead_id: req.params.id, won_value: wonValue, won_at: updates.won_at, stage_at_report: "won" },
          { onConflict: "lead_id" }
        );
      } catch { /* migration 130 not applied — non-fatal */ }
    }
    // Auto-retry: a signed PTSA blocked only by a missing site address should now create the job +
    // Dropbox folder once the address is filled in — so the "job not created" warning clears itself.
    let leadOut = data;
    let provisioning;
    if (data?.ptsa_status === "signed" && !data?.job_id && String(data?.site_address || "").trim()) {
      provisioning = await provisionSignedLeadJob(sb, req.params.id, req.caller?.id || null, data);
      if (provisioning?.jobId) {
        const { data: refreshed } = await sb.from("leads").select("*").eq("id", req.params.id).maybeSingle();
        if (refreshed) leadOut = refreshed;
      }
    }
    res.json({ ok: true, lead: leadOut, gateWarnings, provisioning });

    // G0-B: geocode-on-save for stage progression to qualify+ (non-blocking, after response).
    // Only fires when:
    //   (a) stage changed to qualify or beyond, AND
    //   (b) the lead is not already geocoded at address precision.
    // This prevents re-geocoding on every unrelated PATCH.
    try {
      const newStage = updates.stage;
      if (newStage && _GEO_QUALIFY_PLUS.has(newStage) && leadOut?.geo_precision !== "address") {
        const rawAddr = String(leadOut?.site_address || current?.site_address || "").trim();
        const rawSub  = String(leadOut?.suburb       || current?.suburb       || "").trim();
        const geoQuery = rawAddr || rawSub;
        if (geoQuery) {
          geocodeToFacts("leads", req.params.id, geoQuery, "address").catch(() => {});
        }
      }
      // G1-B: site enrichment — fire after geocode on qualify+, non-blocking.
      if (newStage && _GEO_QUALIFY_PLUS.has(newStage) && !leadOut?.site_enriched_at) {
        enrichSite("leads", req.params.id).catch(() => {});
      }
    } catch { /* never block the response */ }
  });

  // ── Lead → Job conversion (Phase 2: non-lossy, server-side, provenance-stamped) ──
  // Replaces the old client-side column copy in LeadDetail.jsx createJobFromLead().
  // Creates the job (mirroring POST /api/jobs — same dedup + inline address
  // normalisation, NO Dropbox side-effects since that path has none) and then stamps
  // each carried lead fact via setFact(... source:'system', reason:'lead_conversion')
  // so job_fact_history records the value came from the lead (Canonical Data Law:
  // facts stamp forward, never re-typed). DOES NOT write original_contract_value —
  // that is set at WIN by Phase 5. Returns the new job in camelCase.
  app.post("/api/sales/leads/:id/convert-to-job", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const leadId = String(req.params.id || "").trim();
    if (!leadId) return err(res, 400, "Lead id required.");
    const actorId = req.caller?.id || null;

    try {
      // Thin wrapper: load the lead, then delegate every side-effect to convertLeadToJob().
      const { data: lead, error: leadErr } = await sb.from("leads").select("*").eq("id", leadId).maybeSingle();
      if (leadErr) return err(res, 400, translateDbError(leadErr));
      if (!lead) return err(res, 404, "Lead not found", "NOT_FOUND");

      const { job, alreadyConverted, stampedFacts } = await convertLeadToJob(sb, lead, actorId);
      if (alreadyConverted) return ok(res, { job: rowToCamel(job), alreadyConverted: true });
      return ok(res, { job: rowToCamel(job), stampedFacts });
    } catch (e) {
      if (e?.httpStatus && e?.publicMessage) return err(res, e.httpStatus, e.publicMessage);
      console.error("[convert-to-job]", e);
      return err(res, 500, "Failed to convert lead to job.");
    }
  });

  // Provision the job + Dropbox folder for a lead whose PTSA is signed. Idempotent + NON-FATAL,
  // so it's safe to re-run once a previously-missing site address is added (markers no-op repeats).
  // Returns the same `provisioning` summary shape the mark-signed route returns.
  async function provisionSignedLeadJob(sb, leadId, actorId, fallbackLead) {
    const provisioning = { jobId: null, jobCreated: false, dropboxProvisioned: false, leadDataBackfilled: false, dropboxConfigured: dropboxConfigured() };
    try {
      if (dropboxConfigured()) {
        let { data: freshLead } = await sb.from("leads").select("*").eq("id", leadId).maybeSingle();
        freshLead = freshLead || fallbackLead;
        let job = null;
        if (freshLead?.job_id) {
          const { data: existing } = await sb.from("jobs").select("*").eq("id", freshLead.job_id).maybeSingle();
          job = existing || null;
        }
        if (!job && freshLead) {
          try {
            const result = await convertLeadToJob(sb, freshLead, actorId);
            job = result.job;
            provisioning.jobCreated = !result.alreadyConverted;
          } catch (e) {
            console.warn("[provisionSignedLeadJob] convertLeadToJob skipped:", e?.publicMessage || e?.message || e);
          }
        }
        if (job) {
          provisioning.jobId = job.id;
          const jobAddress = job.address;
          if (!job.dropbox_provisioned_at && jobAddress) {
            try {
              const fld = await ensureJobFolderStructure({ jobAddress });
              const jobUpdate = { dropbox_provisioned_at: new Date().toISOString() };
              if (fld?.dropboxSharedLinkUrl) { jobUpdate.dropbox_shared_link = fld.dropboxSharedLinkUrl; jobUpdate.dropbox_link = fld.dropboxSharedLinkUrl; }
              await sb.from("jobs").update(jobUpdate).eq("id", job.id);
              provisioning.dropboxProvisioned = true;
            } catch (e) {
              console.warn("[provisionSignedLeadJob] ensureJobFolderStructure skipped:", e?.message || e);
            }
          } else if (job.dropbox_provisioned_at) {
            provisioning.dropboxProvisioned = true;
          }
          if (!job.lead_data_backfilled_at && jobAddress) {
            try {
              const bf = await backfillLeadDataToJobFolder({ sb, leadId, jobAddress });
              await sb.from("jobs").update({ lead_data_backfilled_at: new Date().toISOString() }).eq("id", job.id);
              provisioning.leadDataBackfilled = true;
              provisioning.backfill = bf;
            } catch (e) {
              console.warn("[provisionSignedLeadJob] backfillLeadDataToJobFolder skipped:", e?.message || e);
            }
          } else if (job.lead_data_backfilled_at) {
            provisioning.leadDataBackfilled = true;
          }
        }
      }
    } catch (e) {
      console.warn("[provisionSignedLeadJob] orchestration skipped:", e?.message || e);
    }
    if (!provisioning.jobId) provisioning.siteAddressWarning = true;
    return provisioning;
  }

  // ── Mark a PTSA as SIGNED (sole writer of the signed state) ───────────────────
  // One event: (a) store the signed PDF in the 'lead-documents' bucket (source of
  // truth), (b) stamp the lead signed, (c) [non-fatal mirror] create the job (if
  // lead-sourced) + Dropbox folder tree, and (d) backfill the lead's docs/notes/
  // conversations into the job folder. Supabase is the source of truth; Dropbox is a
  // NON-FATAL mirror — a Dropbox outage or missing folder must never 500 this request.
  // The blanket PATCH /api/sales/leads/:id rejects ptsa_status='signed' so this is the
  // ONLY path that can mark a PTSA signed.
  app.post("/api/sales/leads/:id/ptsa/mark-signed", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const leadId = String(req.params.id || "").trim();
    if (!leadId) return err(res, 400, "Lead id required.");
    const actorId = req.caller?.id || null;

    const { signedPdfBase64, filename, signedDate } = req.body || {};
    if (!filename?.trim()) return err(res, 400, "filename is required.");
    if (!signedPdfBase64 || typeof signedPdfBase64 !== "string") {
      return err(res, 400, "signedPdfBase64 is required.");
    }
    // Strip a possible data-URL prefix, then validate it is real base64.
    const b64 = signedPdfBase64.includes(",") ? signedPdfBase64.split(",").pop() : signedPdfBase64;
    let buffer;
    try {
      buffer = Buffer.from(b64, "base64");
    } catch {
      return err(res, 400, "signedPdfBase64 is not valid base64.");
    }
    if (!buffer || buffer.length === 0) return err(res, 400, "signedPdfBase64 is empty or not valid base64.");

    try {
      // Load the lead.
      const { data: lead, error: leadErr } = await sb.from("leads").select("*").eq("id", leadId).maybeSingle();
      if (leadErr) return err(res, 400, translateDbError(leadErr));
      if (!lead) return err(res, 404, "Lead not found", "NOT_FOUND");

      // ── Supabase-primary order (critical) ────────────────────────────────────
      const today = new Date().toISOString().slice(0, 10);
      const signedDateStr = (typeof signedDate === "string" && signedDate.trim()) ? signedDate.trim().slice(0, 10) : today;

      // (1) Upload the signed PDF to the 'lead-documents' bucket at the LAW path:
      //     [bucket]/leads/<id>/<YYYY-MM-DD>-<sanitised-filename> (lowercase, spaces→hyphens,
      //     strip specials except - and .).
      const sanitised = filename
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9.\-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "signed-ptsa.pdf";
      const storagePath = `leads/${leadId}/${signedDateStr}-${sanitised}`;
      const { error: uploadErr } = await sb.storage
        .from("lead-documents")
        .upload(storagePath, buffer, { contentType: "application/pdf", upsert: true });
      if (uploadErr) return err(res, 502, `Storage upload failed: ${uploadErr.message}`);

      // (2) Stamp the lead signed. This MUST persist even if later steps fail.
      const { error: stampErr } = await sb.from("leads").update({
        ptsa_status: "signed",
        pretender_signed_date: signedDateStr,
        ptsa_signed_document_path: storagePath,
        ptsa_signed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", leadId);
      if (stampErr) {
        // Best-effort cleanup of the uploaded file if the stamp itself fails.
        await sb.storage.from("lead-documents").remove([storagePath]).catch(() => {});
        return err(res, 400, translateDbError(stampErr));
      }

      // (3) Record the lead_documents row (document_type:'ptsa_signed') — BEST-EFFORT.
      //     A failure here does not fail the request (the signed stamp already persisted).
      try {
        await sb.from("lead_documents").insert({
          lead_id: leadId,
          filename: filename.trim(),
          file_size: buffer.length,
          mime_type: "application/pdf",
          storage_path: storagePath,
          document_type: "ptsa_signed",
          uploaded_by: req.caller?.email || "Unknown",
          created_at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn("[ptsa/mark-signed] lead_documents insert (best-effort):", e?.message || e);
      }

      // ── Dropbox NON-FATAL orchestration (mirror only) ────────────────────────
      // Re-read the lead so job_id reflects any in-flight conversion. Markers make
      // re-marking a no-op. Nothing below may 500 the request.
      const provisioning = { jobId: null, jobCreated: false, dropboxProvisioned: false, leadDataBackfilled: false, dropboxConfigured: dropboxConfigured() };
      try {
        if (dropboxConfigured()) {
          let { data: freshLead } = await sb.from("leads").select("*").eq("id", leadId).maybeSingle();
          freshLead = freshLead || lead;

          // (a) Create the job if lead-sourced and not yet converted.
          let job = null;
          if (freshLead.job_id) {
            const { data: existing } = await sb.from("jobs").select("*").eq("id", freshLead.job_id).maybeSingle();
            job = existing || null;
          }
          if (!job) {
            try {
              const result = await convertLeadToJob(sb, freshLead, actorId);
              job = result.job;
              provisioning.jobCreated = !result.alreadyConverted;
            } catch (e) {
              // A missing site address (or other convert error) is non-fatal here —
              // the signed PDF + stamp already persisted. Log and skip the mirror.
              console.warn("[ptsa/mark-signed] convertLeadToJob skipped:", e?.publicMessage || e?.message || e);
            }
          }

          if (job) {
            provisioning.jobId = job.id;
            const jobAddress = job.address;

            // (b) Provision the Dropbox folder tree + stamp links/markers. Idempotent.
            if (!job.dropbox_provisioned_at && jobAddress) {
              try {
                const fld = await ensureJobFolderStructure({ jobAddress });
                const jobUpdate = { dropbox_provisioned_at: new Date().toISOString() };
                if (fld?.dropboxSharedLinkUrl) {
                  jobUpdate.dropbox_shared_link = fld.dropboxSharedLinkUrl;
                  jobUpdate.dropbox_link = fld.dropboxSharedLinkUrl;
                }
                await sb.from("jobs").update(jobUpdate).eq("id", job.id);
                provisioning.dropboxProvisioned = true;
              } catch (e) {
                console.warn("[ptsa/mark-signed] ensureJobFolderStructure skipped:", e?.message || e);
              }
            } else if (job.dropbox_provisioned_at) {
              provisioning.dropboxProvisioned = true; // already done — no-op
            }

            // (c) Backfill the lead's docs/notes/conversations into INTERNAL/LEAD DOCS.
            if (!job.lead_data_backfilled_at && jobAddress) {
              try {
                const bf = await backfillLeadDataToJobFolder({ sb, leadId, jobAddress });
                await sb.from("jobs").update({ lead_data_backfilled_at: new Date().toISOString() }).eq("id", job.id);
                provisioning.leadDataBackfilled = true;
                provisioning.backfill = bf;
              } catch (e) {
                console.warn("[ptsa/mark-signed] backfillLeadDataToJobFolder skipped:", e?.message || e);
              }
            } else if (job.lead_data_backfilled_at) {
              provisioning.leadDataBackfilled = true; // already done — no-op
            }
          }
        }
      } catch (e) {
        // Belt-and-braces: never let the mirror 500 the request.
        console.warn("[ptsa/mark-signed] Dropbox orchestration skipped:", e?.message || e);
      }

      // When job creation failed (missing site_address), flag it so the frontend can
      // show a hard warning and block tender handoff (SAM-W03-001 Option B).
      if (!provisioning.jobId) provisioning.siteAddressWarning = true;

      // Return the freshly-stamped lead + a soft provisioning summary.
      const { data: finalLead } = await sb.from("leads").select("*").eq("id", leadId).maybeSingle();
      return ok(res, { lead: rowToCamel(finalLead || lead), provisioning });
    } catch (e) {
      console.error("[ptsa/mark-signed]", e);
      return err(res, 500, "Failed to mark the PTSA as signed.");
    }
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

      const LEAD_FIELDS = ["name","first_name","last_name","email","phone","suburb","site_address"];
      const PROJECT_FIELDS = ["project_type","estimated_value","floor_area_estimate","design_stage","desired_start_date","discovery_notes"];
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

      const { error: leadUpdErr } = await sb.from("leads").update(leadUpdates).eq("id", req.params.id);
      if (leadUpdErr) return res.status(400).json({ ok: false, error: "Could not apply suggestions: " + leadUpdErr.message });

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
      client_name:      [lead.first_name, lead.last_name].filter(Boolean)
                          .map(s => s.charAt(0).toUpperCase() + s.slice(1))
                          .join(" ") || "[CLIENT NAME]",
      client_email:     lead.email || "—",
      client_phone:     lead.phone || "—",
      site_address:     lead.site_address || lead.suburb || "[SITE ADDRESS]",
      project_type:     PROJECT_TYPE_LABELS[lead.project_type] || lead.project_type || "[PROJECT TYPE]",
      services_list:    servicesList,
      scope_notes:      lead.ptsa_project_scope || "[Scope to be confirmed with client]",
      fee_formatted:    feeFormatted,
      credit_clause:    creditClause,
      builder_abn:      "88 656 051 188",
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

  // ── Reference projects library ─────────────────────────────────────────────
  app.get("/api/sales/reference-projects", requireAuth, async (_req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { data, error } = await sb
      .from("reference_projects")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("project_label", { ascending: true });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, projects: data || [] });
  });

  app.post("/api/sales/reference-projects", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const body = { ...req.body, updated_at: new Date().toISOString() };
    if (!body.project_label?.trim()) {
      return res.status(400).json({ ok: false, error: "project_label required" });
    }
    const { data, error } = await sb
      .from("reference_projects")
      .insert({ ...body, created_at: new Date().toISOString() })
      .select()
      .single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    res.json({ ok: true, project: data });
  });

  app.put("/api/sales/reference-projects/:id", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { data, error } = await sb
      .from("reference_projects")
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    res.json({ ok: true, project: data });
  });

  app.delete("/api/sales/reference-projects/:id", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { data, error } = await sb
      .from("reference_projects")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    res.json({ ok: true, project: data });
  });

  // ─── Lead Notes ───────────────────────────────────────────────────────────
  // Notes are persistent internal context on a lead — distinct from the activity
  // timeline (which logs events) and conversations (which store transcripts).

  app.get("/api/sales/leads/:id/notes", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { data, error } = await sb
      .from("lead_notes")
      .select("*")
      .eq("lead_id", req.params.id)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, notes: data || [] });
  });

  app.post("/api/sales/leads/:id/notes", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { body, note_type, author_name } = req.body;
    if (!body?.trim()) return res.status(400).json({ ok: false, error: "body required" });
    const now = new Date().toISOString();
    const { data, error } = await sb
      .from("lead_notes")
      .insert({
        lead_id: req.params.id,
        body: body.trim(),
        note_type: note_type || "internal",
        author_name: author_name || req.caller?.email || "Unknown",
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    // Touch the lead's updated_at so it surfaces in recency sorts
    await sb.from("leads").update({ updated_at: now }).eq("id", req.params.id);
    res.json({ ok: true, note: data });
  });

  app.patch("/api/sales/leads/:id/notes/:noteId", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { body, note_type } = req.body;
    if (!body?.trim()) return res.status(400).json({ ok: false, error: "body required" });
    const now = new Date().toISOString();
    const { data, error } = await sb
      .from("lead_notes")
      .update({ body: body.trim(), note_type: note_type || "internal", updated_at: now })
      .eq("id", req.params.noteId)
      .eq("lead_id", req.params.id)   // scope to this lead for safety
      .select()
      .single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    res.json({ ok: true, note: data });
  });

  app.delete("/api/sales/leads/:id/notes/:noteId", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { error } = await sb
      .from("lead_notes")
      .delete()
      .eq("id", req.params.noteId)
      .eq("lead_id", req.params.id);
    if (error) return res.status(400).json({ ok: false, error: error.message });
    res.json({ ok: true });
  });

  // ─── Lead Documents ───────────────────────────────────────────────────────
  // Files attached to a lead (blueprints, briefs, site surveys, client references).
  // Binary data is stored in Supabase Storage bucket 'lead-documents'.
  // The lead_documents table holds metadata + storage path.
  // Requires: 'lead-documents' bucket created in Supabase dashboard (private).

  app.get("/api/sales/leads/:id/documents", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { data, error } = await sb
      .from("lead_documents")
      .select("*")
      .eq("lead_id", req.params.id)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });

    // Generate short-lived signed URLs so the client can download each file
    const docs = await Promise.all((data || []).map(async (doc) => {
      const { data: signed, error: signErr } = await sb.storage
        .from("lead-documents")
        .createSignedUrl(doc.storage_path, 3600); // 1-hour expiry
      return { ...doc, download_url: signErr ? null : signed?.signedUrl };
    }));

    res.json({ ok: true, documents: docs });
  });

  app.post("/api/sales/leads/:id/documents", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });

    const { filename, data: fileDataB64, mime_type, document_type, uploaded_by } = req.body;
    if (!filename?.trim()) return res.status(400).json({ ok: false, error: "filename required" });
    if (!fileDataB64) return res.status(400).json({ ok: false, error: "data (base64) required" });

    const buffer = Buffer.from(fileDataB64, "base64");
    const safeName = filename.replace(/[^\w.\-]/g, "_");
    const storagePath = `leads/${req.params.id}/${Date.now()}_${safeName}`;

    // Upload to Supabase Storage
    const { error: uploadErr } = await sb.storage
      .from("lead-documents")
      .upload(storagePath, buffer, {
        contentType: mime_type || "application/octet-stream",
        upsert: false,
      });
    if (uploadErr) return res.status(502).json({ ok: false, error: `Storage upload failed: ${uploadErr.message}` });

    // Record metadata in DB
    const now = new Date().toISOString();
    const { data: doc, error: dbErr } = await sb
      .from("lead_documents")
      .insert({
        lead_id: req.params.id,
        filename: filename.trim(),
        file_size: buffer.length,
        mime_type: mime_type || null,
        storage_path: storagePath,
        document_type: document_type || "other",
        uploaded_by: uploaded_by || req.caller?.email || "Unknown",
        created_at: now,
      })
      .select()
      .single();
    if (dbErr) {
      // Best-effort cleanup of the uploaded file if DB insert fails
      await sb.storage.from("lead-documents").remove([storagePath]);
      return res.status(400).json({ ok: false, error: dbErr.message });
    }

    // Return with a signed download URL
    const { data: signed } = await sb.storage
      .from("lead-documents")
      .createSignedUrl(storagePath, 3600);

    res.json({ ok: true, document: { ...doc, download_url: signed?.signedUrl || null } });
  });

  app.delete("/api/sales/leads/:id/documents/:docId", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });

    // Fetch the record first so we know the storage path
    const { data: doc, error: fetchErr } = await sb
      .from("lead_documents")
      .select("storage_path")
      .eq("id", req.params.docId)
      .eq("lead_id", req.params.id)
      .single();
    if (fetchErr || !doc) return res.status(404).json({ ok: false, error: "Document not found" });

    // Delete from Storage
    await sb.storage.from("lead-documents").remove([doc.storage_path]);

    // Delete the DB record
    const { error: dbErr } = await sb
      .from("lead_documents")
      .delete()
      .eq("id", req.params.docId)
      .eq("lead_id", req.params.id);
    if (dbErr) return res.status(400).json({ ok: false, error: dbErr.message });

    res.json({ ok: true });
  });
}

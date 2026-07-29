// seedWhsRegisters.mjs — ingest the WHS agent's authoritative content into the Hub.
// Reads docs/whs/registers/whs_content.json ({ modules, sources, conflicts }), upserts the 28 control
// modules (with rendered content_html) + the 44-source register + conflict log, and retires the 8
// prototype seeds. Idempotent (upsert by module_code / source id). Everything stays review_status='draft'.
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env. Run: node scripts/whs/seedWhsRegisters.mjs
import { config as dotenvConfig } from "dotenv";
dotenvConfig();
import { readFileSync } from "fs";
import { getServiceSupabase } from "../../server/lib/supabaseService.mjs";
import { renderSwmsModuleHtml } from "../../server/lib/whs/swmsRender.mjs";

// Which carpentry work stages each module is relevant to (Phase-A display grouping on the WHS tab).
// The per-job questionnaire (Phase B) refines this; here it just decides where a module surfaces.
const WORK_CATEGORY = {
  "H-01": ["first_fix_framing"], "H-02": ["first_fix_framing"], "H-03": ["first_fix_framing", "roofing"],
  "H-04": ["roofing"], "H-05": ["cladding"], "H-06": ["general"], "H-07": ["general"],
  "H-08": ["demolition"], "H-09": ["demolition"], "H-10": ["demolition"], "H-11": ["general"],
  "H-12": ["general"], "H-13": ["demolition"], "H-14": ["cladding", "first_fix_framing", "second_fix"],
  "T-01": ["cladding", "first_fix_framing", "second_fix"], "T-02": ["first_fix_framing", "second_fix"],
  "T-03": ["first_fix_framing", "cladding", "second_fix"], "T-04": ["first_fix_framing", "cladding", "second_fix", "roofing"],
  "T-05": ["general"], "T-06": ["general"], "T-07": ["general"], "T-08": ["general"], "T-09": ["general"],
  "T-10": ["general"], "T-11": ["general"], "T-12": ["second_fix", "general"], "T-13": ["general"], "T-14": ["general"],
};

const sb = getServiceSupabase();
if (!sb) { console.error("No Supabase service client (check .env)."); process.exit(1); }

const data = JSON.parse(readFileSync(new URL("../../docs/whs/registers/whs_content.json", import.meta.url), "utf8"));
const modules = data.modules || [], sources = data.sources || [], conflicts = data.conflicts || [];
console.log(`Loaded ${modules.length} modules, ${sources.length} sources, ${conflicts.length} conflicts.`);

// ── 1. Source Register ────────────────────────────────────────────────────────────────────────
for (const s of sources) {
  const row = {
    id: s.id, tier: s.tier ?? null, title: s.title, issuing_authority: s.issuingAuthority || null,
    jurisdiction: s.jurisdiction || null, publication_date: s.publicationDate || null, effective_date: s.effectiveDate || null,
    version: s.version || null, status: s.status || "current", activities_covered: s.activitiesCovered || null,
    hazards_covered: s.hazardsCovered || null, extracted_controls: s.extractedControls || null, notes: s.notes || null,
    review_status: "draft", updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("whs_sources").upsert(row, { onConflict: "id" });
  if (error) console.warn(`  source ${s.id}: ${error.message}`);
}
console.log("✓ sources upserted");

// ── 2. Conflict log ──────────────────────────────────────────────────────────────────────────
for (const c of conflicts) {
  const { error } = await sb.from("whs_source_conflicts").upsert(
    { id: c.id, conflict: c.conflict, sources: c.sources || null, dates: c.dates || null, resolution: c.resolution || null, action: c.action || null },
    { onConflict: "id" });
  if (error) console.warn(`  conflict ${c.id}: ${error.message}`);
}
console.log("✓ conflicts upserted");

// ── 3. Control modules (upsert by module_code) ─────────────────────────────────────────────────
for (const m of modules) {
  const content_json = {
    activity: m.activity, hazard: m.hazard, trigger: m.trigger,
    controlOptions: m.controlOptions || [], ppeRules: m.ppeRules || [],
    monitorReview: m.monitorReview || "", responsibleInstall: m.responsibleInstall || "",
    responsibleUse: m.responsibleUse || "", sourceRefs: m.sourceRefs || [], note: m.note || "",
  };
  const row = {
    trade: "Carpentry", module_code: m.code, title: m.title,
    is_hrcw: m.isHrcw || null, part: m.part || (String(m.code).startsWith("H") ? 1 : 2),
    activity: m.activity || null, hazard: m.hazard || null, trigger: m.trigger || null,
    content_json, content_html: renderSwmsModuleHtml(content_json),
    work_category: WORK_CATEGORY[m.code] || ["general"],
    is_high_risk: m.isHrcw === "yes", is_active: true, review_status: "draft",
    summary: (m.hazard || "").slice(0, 240), version: 1,
    source: (m.sourceRefs || []).join(", ") || null,
  };
  // Upsert on module_code; if the row doesn't exist yet, insert.
  const { data: existing } = await sb.from("swms_templates").select("id").eq("module_code", m.code).maybeSingle();
  const res = existing
    ? await sb.from("swms_templates").update(row).eq("id", existing.id)
    : await sb.from("swms_templates").insert(row);
  if (res.error) console.warn(`  module ${m.code}: ${res.error.message}`);
}
console.log(`✓ ${modules.length} modules upserted`);

// ── 4. Retire the 8 prototype seeds (they have no module_code) + clear their job attachments ────
const { data: old } = await sb.from("swms_templates").select("id").eq("trade", "Carpentry").is("module_code", null);
const oldIds = (old || []).map((o) => o.id);
if (oldIds.length) {
  await sb.from("project_swms").delete().not("carpentry_job_id", "is", null).in("swms_template_id", oldIds);
  await sb.from("swms_templates").update({ is_active: false }).in("id", oldIds);
  console.log(`✓ retired ${oldIds.length} prototype seeds + cleared their carpentry attachments`);
}

console.log("\nDone. All content is DRAFT — mark reviewed in Settings once the WHS reviewer approves.");

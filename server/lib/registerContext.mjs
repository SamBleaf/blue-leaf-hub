/**
 * registerContext.mjs — the read-only Sales/Project context shown at the top of the Master Register.
 *
 * Tab 20 §F / Tab 21 FACT questions: client, site, project type, budget direction, goals, meetings,
 * consultants, drawings and commercial state are ALREADY owned by Sales/Hub. The register shows them as
 * prefilled context and links to the authoritative form — it never re-asks or stores a copy.
 * Owner by phase: before conversion the lead; after conversion the job (via the facts registry columns);
 * consultants via job_contact_roles (falling back to the lead's consultant_roster).
 *
 * Every read is defensive: a missing optional table/column degrades to "not on file", never an error.
 */
import { setFact } from "./factsService.mjs";
import { DELIVERY_MODELS } from "../../src/lib/register.js";

const pickStr = (...vals) => { for (const v of vals) { const s = v == null ? "" : String(v).trim(); if (s) return s; } return ""; };
const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

async function safe(fn, fallback) { try { const r = await fn(); return r ?? fallback; } catch { return fallback; } }

export async function loadRegisterContext(sb, leadId) {
  const { data: lead } = await sb.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) return null;
  const job = lead.job_id ? await safe(async () => (await sb.from("jobs").select("*").eq("id", lead.job_id).maybeSingle()).data, null) : null;

  const consultants = await safe(async () => {
    const ors = [`lead_id.eq.${lead.id}`]; if (job?.id) ors.push(`job_id.eq.${job.id}`);
    const { data, error } = await sb.from("job_contact_roles")
      .select("id, role, status, contact:crm_contacts(first_name, last_name, company, email)").or(ors.join(","));
    if (error) return null;
    return (data || []).filter((r) => r.role !== "referrer").map((r) => ({
      role: r.role, status: r.status || null,
      name: pickStr([r.contact?.first_name, r.contact?.last_name].filter(Boolean).join(" "), r.contact?.company),
      company: r.contact?.company || null,
    }));
  }, null);
  const roster = Array.isArray(lead.consultant_roster) ? lead.consultant_roster : [];

  const meetings = await safe(async () => {
    const { data, error } = await sb.from("lead_meetings").select("meeting_type, scheduled_at, status, title")
      .eq("lead_id", lead.id).order("scheduled_at", { ascending: true });
    return error ? [] : (data || []);
  }, []);

  const drawings = await safe(async () => {
    const sel = (cols) => sb.from("lead_documents").select(cols).eq("lead_id", lead.id)
      .in("document_type", ["concept_drawings", "working_drawings", "blueprint", "survey", "consultant_document", "supplier_document"])
      .order("created_at", { ascending: false }).limit(30);
    let { data, error } = await sel("id, filename, document_type, created_at, revision_label, discipline, issuer, doc_number, received_at, review_status");
    if (error?.code === "42703") ({ data, error } = await sel("id, filename, document_type, created_at"));
    return error ? [] : (data || []);
  }, []);

  const feeProposal = await safe(async () => {
    let q = sb.from("fee_proposals").select("id, quote_number, status, updated_at");
    q = lead.fee_proposal_id ? q.eq("id", lead.fee_proposal_id) : job?.id ? q.eq("job_id", job.id) : null;
    if (!q) return null;
    const { data } = await q.order("updated_at", { ascending: false }).limit(1);
    return data?.[0] || null;
  }, null);

  const whsProfile = job?.id ? await safe(async () => {
    const { data, error } = await sb.from("whs_site_profiles").select("id, updated_at").eq("job_id", job.id).maybeSingle();
    return error ? null : data;
  }, null) : null;

  const src = job || lead;                      // site intelligence is enriched on both spines (mig 135)
  const deliveryModel = job?.delivery_model || lead.delivery_model || null;
  return {
    owner: job ? "job" : "lead",
    identity: {
      clientName: pickStr(job?.client_name, lead.name, [lead.first_name, lead.last_name].filter(Boolean).join(" ")),
      email: pickStr(job?.client_email, lead.email) || null,
      phone: pickStr(job?.client_phone, lead.phone) || null,
      partnerName: lead.partner_name || null,
      siteAddress: pickStr(job?.address, lead.site_address),
      suburb: pickStr(job?.address_suburb, lead.suburb) || null,
      landStatus: lead.land_status || null,
    },
    projectType: job?.project_type || lead.project_type || null,
    deliveryModel,
    deliveryModelSource: job?.delivery_model ? "job" : lead.delivery_model ? "lead" : null,
    stage: lead.stage, stageEnteredAt: lead.stage_entered_at || null,
    budget: {
      min: num(lead.construction_budget_min), max: num(lead.construction_budget_max),
      estimatedValue: num(job?.estimated_value ?? lead.estimated_value),
      financeStatus: lead.finance_status || null, confirmed: lead.wo_budget_confirmed || null,
      desiredStart: lead.desired_start_date || null,
    },
    goals: {
      keyRequirements: lead.key_requirements || null, vision: lead.wo_client_vision || null,
      excitedAbout: lead.wo_most_excited_about || null, concern: lead.wo_biggest_concern || null,
      description: lead.project_description || null, riskFlags: Array.isArray(lead.risk_flags) ? lead.risk_flags : [],
    },
    commercial: {
      ptsaStatus: lead.ptsa_status || null, contractStatus: lead.contract_status || null,
      feeProposal: feeProposal ? { id: feeProposal.id, quoteNumber: feeProposal.quote_number, status: feeProposal.status } : null,
      wonSubstatus: lead.won_substatus || null,
    },
    consultants: consultants && consultants.length ? consultants
      : roster.map((r) => ({ role: r.role || r.type || "consultant", name: pickStr(r.name, r.company, r.contact_name), status: r.status || null, company: r.company || null })),
    meetings: meetings.map((m) => ({ type: m.meeting_type, at: m.scheduled_at, status: m.status, title: m.title || null })),
    drawings: drawings.map((d) => ({ id: d.id, filename: d.filename, type: d.document_type, at: d.created_at, revision: d.revision_label || null,
      discipline: d.discipline || null, issuer: d.issuer || null, docNumber: d.doc_number || null, receivedAt: d.received_at || null, reviewStatus: d.review_status || null })),
    site: {
      council: src.site_council || null, zone: src.site_zone || null, bushfire: src.site_bushfire_prone ?? null,
      slopeBand: src.site_slope_band || null, complexity: src.site_complexity || null,
      whsProfileId: whsProfile?.id || null,
    },
  };
}

/**
 * Write the delivery-model fact through its owner: the lead before conversion, the job (facts service,
 * provenance-stamped) after. Never both — no duplicate writable copy after conversion (Tab 23 Q4).
 */
export async function setDeliveryModel(sb, leadId, value, { actorId } = {}) {
  if (value !== null && !Object.prototype.hasOwnProperty.call(DELIVERY_MODELS, value)) throw Object.assign(new Error("Unknown delivery model."), { status: 400 });
  const { data: lead } = await sb.from("leads").select("id, job_id").eq("id", leadId).maybeSingle();
  if (!lead) throw Object.assign(new Error("Lead not found"), { status: 404 });
  if (lead.job_id) {
    const r = await setFact(lead.job_id, "delivery_model", value, { source: "manual", reason: "master_register", actorId });
    if (!r?.ok) throw Object.assign(new Error(r?.error || "Could not save the delivery model."), { status: 400 });
    return { owner: "job" };
  }
  const { error } = await sb.from("leads").update({ delivery_model: value, updated_at: new Date().toISOString() }).eq("id", leadId);
  if (error) throw Object.assign(new Error(error.code === "42703" ? "Apply migration 213 first (delivery model)." : "Could not save the delivery model."), { status: error.code === "42703" ? 503 : 400 });
  return { owner: "lead" };
}

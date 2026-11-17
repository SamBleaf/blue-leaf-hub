/**
 * registerContext.mjs — the read-only Sales/Project context shown at the top of the Master Register.
 *
 * Tab 20 §F / Tab 21 FACT questions: client, site, project type, budget direction, goals, meetings,
 * consultants, drawings and commercial state are ALREADY owned by Sales/Hub. The register shows them as
 * prefilled context and links to the authoritative form — it never re-asks or stores a copy.
 * Owner by phase: before conversion the lead; after conversion the job (via the facts registry columns);
 * consultants: job_contact_roles and the lead's consultant_roster merged into one list (projectStory.mergeConsultants),
 * each with its contactId and roleId, duplicates removed. Inactive and completed people stay in the list with their
 * status; designTeam() in briefModel.js leaves them out of everything that prints.
 *
 * Every read is defensive: a missing optional table/column degrades to "not on file", never an error.
 */
import { setFact } from "./factsService.mjs";
import { DELIVERY_MODELS, PROJECT_TYPE_LABELS } from "../../src/lib/register.js";
import { mergeConsultants, budgetConfirmedOn, confirmedNoteOf } from "../../src/lib/projectStory.js";
import { resolveEngagementPathway } from "../../src/lib/stageGates.js";

const pickStr = (...vals) => { for (const v of vals) { const s = v == null ? "" : String(v).trim(); if (s) return s; } return ""; };
const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

async function safe(fn, fallback) { try { const r = await fn(); return r ?? fallback; } catch { return fallback; } }

export async function loadRegisterContext(sb, leadId) {
  const { data: lead } = await sb.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) return null;
  const job = lead.job_id ? await safe(async () => (await sb.from("jobs").select("*").eq("id", lead.job_id).maybeSingle()).data, null) : null;

  const roleRows = await safe(async () => {
    const ors = [`lead_id.eq.${lead.id}`]; if (job?.id) ors.push(`job_id.eq.${job.id}`);
    const { data, error } = await sb.from("job_contact_roles")
      .select("id, role, status, contact_id, contact:crm_contacts(first_name, last_name, company, email, phone)").or(ors.join(","));
    return error ? [] : (data || []);
  }, []);
  const roster = Array.isArray(lead.consultant_roster) ? lead.consultant_roster : [];
  // Roster people with no role row: read their contact once (one query, not one per person).
  const roleContactIds = new Set(roleRows.map((r) => r.contact_id).filter(Boolean));
  const rosterIds = [...new Set(roster.map((r) => r?.contactId || r?.contact_id).filter((id) => id && !roleContactIds.has(id)))];
  const rosterContacts = rosterIds.length ? await safe(async () => {
    const { data, error } = await sb.from("crm_contacts").select("id, first_name, last_name, company, email, phone").in("id", rosterIds);
    return error ? {} : Object.fromEntries((data || []).map((c) => [c.id, c]));
  }, {}) : {};
  const consultants = mergeConsultants(roleRows, roster, rosterContacts);

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

  // The storeys fact (project_metrics.storeys, Job spine) is read only here: the Rooms list compares it with the floors
  // the rooms are on and says so, never writes it (REGISTER_SCREENS_SPEC.md S2).
  const storeys = job?.id ? await safe(async () => {
    const { data, error } = await sb.from("project_metrics").select("storeys").eq("job_id", job.id).maybeSingle();
    return error ? null : (Number.isFinite(Number(data?.storeys)) && Number(data.storeys) > 0 ? Number(data.storeys) : null);
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
    engagementPathway: resolveEngagementPathway(lead),   // design_build | plans_supplied | architect_tender (stageGates)
    budget: {
      min: num(lead.construction_budget_min), max: num(lead.construction_budget_max),
      estimatedValue: num(job?.estimated_value ?? lead.estimated_value),
      // confirmed: did the client confirm the budget (the free-text Sales field, read as yes or no); confirmedNote: the words
      // typed there beyond a plain "Yes", shown under the toggle so nothing is hidden.
      financeStatus: lead.finance_status || null, confirmed: budgetConfirmedOn(lead.wo_budget_confirmed),
      confirmedNote: confirmedNoteOf(lead.wo_budget_confirmed) || null,
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
    consultants,
    meetings: meetings.map((m) => ({ type: m.meeting_type, at: m.scheduled_at, status: m.status, title: m.title || null })),
    drawings: drawings.map((d) => ({ id: d.id, filename: d.filename, type: d.document_type, at: d.created_at, revision: d.revision_label || null,
      discipline: d.discipline || null, issuer: d.issuer || null, docNumber: d.doc_number || null, receivedAt: d.received_at || null, reviewStatus: d.review_status || null })),
    storeys,
    site: {
      council: src.site_council || null, zone: src.site_zone || null, bushfire: src.site_bushfire_prone ?? null,
      bushfireDetail: src.site_bushfire_detail || null,
      slopeBand: src.site_slope_band || null, complexity: src.site_complexity || null,
      enrichedAt: src.site_enriched_at || null,
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

/**
 * Write project type and/or estimated value through their owner, as setDeliveryModel does: the lead before conversion,
 * the job's facts service (provenance-stamped) after. Fixes the old write-the-lead, read-the-job split once a job exists.
 *   facts: { projectType?, estimatedValue? } — only the keys present are written. null clears.
 */
export async function setProjectFacts(sb, leadId, facts = {}, { actorId } = {}) {
  const writes = [];
  if (Object.prototype.hasOwnProperty.call(facts, "projectType")) {
    const v = facts.projectType === "" ? null : facts.projectType;
    if (v !== null && !Object.prototype.hasOwnProperty.call(PROJECT_TYPE_LABELS, v)) throw Object.assign(new Error("Unknown project type."), { status: 400 });
    writes.push(["project_type", v]);
  }
  if (Object.prototype.hasOwnProperty.call(facts, "estimatedValue")) {
    const raw = facts.estimatedValue;
    const v = raw === "" || raw == null ? null : Number(raw);
    if (v !== null && (!Number.isFinite(v) || v < 0)) throw Object.assign(new Error("The estimated value must be an amount in dollars, ex GST."), { status: 400 });
    writes.push(["estimated_value", v]);
  }
  if (!writes.length) return { owner: null };
  const { data: lead } = await sb.from("leads").select("id, job_id").eq("id", leadId).maybeSingle();
  if (!lead) throw Object.assign(new Error("Lead not found"), { status: 404 });
  if (lead.job_id) {
    for (const [key, value] of writes) {
      const r = await setFact(lead.job_id, key, value, { source: "manual", reason: "master_register", actorId });
      if (!r?.ok) throw Object.assign(new Error(r?.error || "Could not save the project fact."), { status: 400 });
    }
    return { owner: "job" };
  }
  const { error } = await sb.from("leads").update({ ...Object.fromEntries(writes), updated_at: new Date().toISOString() }).eq("id", leadId);
  if (error) throw Object.assign(new Error("Could not save the project fact."), { status: 400 });
  return { owner: "lead" };
}

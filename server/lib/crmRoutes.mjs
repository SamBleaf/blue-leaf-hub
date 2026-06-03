/**
 * crmRoutes.mjs — CRM + Mailing List (MODULE 3)
 *
 * Endpoints:
 *  GET  /api/crm/contacts              list + filter
 *  POST /api/crm/contacts              create
 *  GET  /api/crm/contacts/:id          single with interactions + list memberships
 *  PUT  /api/crm/contacts/:id          update
 *  POST /api/crm/contacts/:id/interact log interaction
 *  POST /api/crm/contacts/:id/convert  convert to lead
 *  GET  /api/crm/search?q=             unified search contacts + leads
 *  GET  /api/crm/dashboard             relationship dashboard data
 *
 *  GET  /api/crm/lists                     all lists with live member counts
 *  POST /api/crm/lists                     create list
 *  GET  /api/crm/lists/:id                 list detail with members
 *  POST /api/crm/lists/:id/members         add contact to list
 *  DELETE /api/crm/lists/:id/members/:mid  remove (unsubscribe) member
 *  POST /api/crm/lists/:id/import          CSV import
 *
 *  GET  /api/crm/lists/:id/sends        sends to this list
 *  POST /api/crm/sends                  create email send draft
 *  PUT  /api/crm/sends/:sid             update draft
 *  POST /api/crm/sends/:sid/send        trigger send via Resend
 *  GET  /api/crm/sends/:sid/recipients  per-recipient table
 *
 *  POST /api/crm/unsubscribe            handle unsubscribe token
 *  POST /api/webhooks/resend            Resend delivery webhooks
 */

import { requireAuth, requireRole } from "./requireAuth.mjs";
import { ok, err, rowToCamel, rowsToCamel, translateDbError } from "./apiResponse.mjs";
import { getServiceSupabase } from "./supabaseService.mjs";
import { getCanonicalContractValue } from "./factsService.mjs";
import jwt from "jsonwebtoken";

const UNSUBSCRIBE_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || "blhub-unsubscribe-secret";

// ─── helpers ──────────────────────────────────────────────────────────────────

// Map a raw Resend provider message to a plain-English, actionable one. Resend's
// strings are usable but technical; the most common campaign failure (an unverified
// sending domain) needs a clear "what to do next" so staff aren't left guessing.
function friendlyResendError(raw) {
  const msg = String(raw || "").trim();
  if (/not verified|domain.*verif|verify.*domain/i.test(msg)) {
    return "the sending domain (blueleafbuilding.com.au) isn't verified in Resend yet. Verify it at resend.com/domains — campaigns can't go out until then.";
  }
  if (/\bfrom\b.*(invalid|not allowed|rejected)|invalid.*from/i.test(msg)) {
    return "the 'from' address was rejected. Use an address on a verified domain (e.g. marketing@blueleafbuilding.com.au).";
  }
  if (/rate.?limit|too many requests/i.test(msg)) {
    return "Resend's rate limit was hit. Wait a minute and try again.";
  }
  if (/api.?key|unauthor|forbidden|401|403/i.test(msg)) {
    return "the Resend API key was rejected. Check RESEND_API_KEY in the Railway environment variables.";
  }
  return msg || "the email provider returned no delivery IDs (check recipient addresses).";
}

function scoreContact(interactions, referralCount, referralJobValue, status) {
  let score = 0;
  const now = Date.now();

  // Referrals (+15 per, capped at 45)
  score += Math.min((referralCount || 0) * 15, 45);

  // Job value signals (+20 per job concept from referral value, capped at 40)
  // We approximate from referral_job_value: each $1.5M segment counts as 1 job
  const estimatedJobs = Math.floor((referralJobValue || 0) / 1_500_000);
  score += Math.min(estimatedJobs * 20, 40);

  // Personal interactions (+3 per, capped at 15)
  const personal = (interactions || []).filter(i =>
    ["call", "meeting", "site_visit"].includes(i.interaction_type)
  ).length;
  score += Math.min(personal * 3, 15);

  // Email opens (+1 per, capped at 10)
  const emailOpens = (interactions || []).filter(i =>
    i.interaction_type === "email_campaign"
  ).length;
  score += Math.min(emailOpens, 10);

  // Recent contact bonus (+5 if any interaction in last 30 days)
  const recentInteraction = (interactions || []).find(i => {
    const d = new Date(i.created_at);
    return (now - d.getTime()) < 30 * 86400 * 1000;
  });
  if (recentInteraction) score += 5;

  // No contact in >90 days penalty (-10)
  const latestInteraction = (interactions || []).sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  )[0];
  if (latestInteraction) {
    const daysSince = (now - new Date(latestInteraction.created_at).getTime()) / 86400000;
    if (daysSince > 90) score -= 10;
  }

  // Status floor
  if (status === "lost") score = 0;

  return Math.max(0, Math.min(100, score));
}

async function smartListMembers(sb, smartFilter) {
  let q = sb.from("crm_contacts").select("id").eq("is_archived", false);

  if (smartFilter.status) {
    q = q.in("status", smartFilter.status);
  }
  if (smartFilter.contact_type) {
    q = q.in("contact_type", smartFilter.contact_type);
  }
  if (smartFilter.created_this_month) {
    const start = new Date();
    start.setDate(1); start.setHours(0, 0, 0, 0);
    q = q.gte("created_at", start.toISOString());
  }

  const { data, error } = await q;
  if (error) return [];
  return data;
}

/**
 * The smart lists a given contact currently qualifies for (auto-membership).
 * Smart lists have no member rows — membership is computed live from the contact's
 * fields (contact_type / status / created_this_month), mirroring smartListMembers().
 * Returns [{ id, name }]. Archived contacts qualify for nothing.
 */
async function smartListsForContact(sb, contact) {
  if (!contact || contact.is_archived) return [];
  const { data, error } = await sb
    .from("mailing_lists")
    .select("id, name, smart_filter")
    .eq("list_type", "smart")
    .eq("is_archived", false);
  if (error || !data) return [];
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  return data
    .filter((list) => {
      const f = list.smart_filter || {};
      if (f.status && !f.status.includes(contact.status)) return false;
      if (f.contact_type && !f.contact_type.includes(contact.contact_type)) return false;
      if (f.created_this_month && (!contact.created_at || new Date(contact.created_at) < monthStart)) return false;
      return true;
    })
    .map((l) => ({ id: l.id, name: l.name }));
}

/**
 * Recompute a contact's referral rollup from job_contact_roles, keeping
 * crm_contacts.referral_count / referral_job_value (and the relationship score)
 * accurate after any role change.
 *
 *   referral_count     = number of DISTINCT jobs the contact credits a referral on
 *                        (credits_referral=true AND job_id IS NOT NULL)
 *   referral_job_value = Σ over those DISTINCT jobs of the job's contract value
 *                        (jobs.contract_value ?? original_contract_value ?? 0)
 *
 * A job credited once is counted once even if the contact has multiple roles on it.
 * EX-GST throughout (jobs.contract_value is stored ex-GST per CLAUDE.md § Amounts).
 * Best-effort + non-fatal: returns { ok } and never throws — callers (incl. the
 * lead→job convert flow) must not break if this fails.
 */
export async function recomputeReferralRollup(sb, contactId) {
  try {
    if (!sb || !contactId) return { ok: false };

    // Credited roles that point at a real job.
    const { data: roles, error: rErr } = await sb
      .from("job_contact_roles")
      .select("job_id")
      .eq("contact_id", contactId)
      .eq("credits_referral", true)
      .not("job_id", "is", null);
    if (rErr) return { ok: false };

    // De-dup to DISTINCT credited jobs (a job credited once is counted once).
    const jobIds = [...new Set((roles || []).map((r) => r.job_id).filter(Boolean))];

    // Sum the CANONICAL contract value (original + Σ signed variations) per credited job —
    // not the stale stored jobs.contract_value column (N2 fix: post-mig-079 that column
    // no longer reflects post-win signed variations).
    let referralJobValue = 0;
    for (const jid of jobIds) {
      referralJobValue += await getCanonicalContractValue(jid);
    }

    const referralCount = jobIds.length;

    // Persist the rollup, then refresh the relationship score off the new numbers.
    await sb.from("crm_contacts").update({
      referral_count: referralCount,
      referral_job_value: referralJobValue,
      updated_at: new Date().toISOString(),
    }).eq("id", contactId);

    const { data: contact } = await sb
      .from("crm_contacts").select("status").eq("id", contactId).single();
    const { data: interactions } = await sb
      .from("crm_interactions").select("interaction_type, created_at").eq("contact_id", contactId);
    if (contact) {
      const newScore = scoreContact(interactions || [], referralCount, referralJobValue, contact.status);
      await sb.from("crm_contacts").update({
        relationship_score: newScore,
        relationship_score_updated_at: new Date().toISOString(),
      }).eq("id", contactId);
    }

    return { ok: true, referralCount, referralJobValue };
  } catch (e) {
    console.warn("[recomputeReferralRollup]", e?.message || e);
    return { ok: false };
  }
}

// ─── registration ─────────────────────────────────────────────────────────────

export function registerCrmRoutes(app) {
  const sb = () => getServiceSupabase();

  // ─── Dashboard ────────────────────────────────────────────────────────────

  app.get("/api/crm/dashboard", requireAuth, async (req, res) => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // Contacts with overdue or due-today actions
    const { data: actionContacts } = await sb()
      .from("crm_contacts")
      .select("id, first_name, last_name, contact_type, status, relationship_score, next_action_type, next_action_due_date, last_contact_date, created_at")
      .eq("is_archived", false)
      .neq("next_action_type", "none")
      .neq("next_action_type", "waiting")
      .not("next_action_due_date", "is", null)
      .lte("next_action_due_date", new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0])
      .order("next_action_due_date", { ascending: true })
      .limit(20);

    // Top relationships by score
    const { data: topRelationships } = await sb()
      .from("crm_contacts")
      .select("id, first_name, last_name, contact_type, relationship_score, referral_count, referral_job_value, last_contact_date")
      .eq("is_archived", false)
      .order("relationship_score", { ascending: false })
      .limit(10);

    // Count stats
    const { count: overdueCount } = await sb()
      .from("crm_contacts")
      .select("id", { count: "exact", head: true })
      .eq("is_archived", false)
      .not("next_action_due_date", "is", null)
      .lt("next_action_due_date", todayStr)
      .neq("next_action_type", "none")
      .neq("next_action_type", "waiting");

    const { count: noContactCount } = await sb()
      .from("crm_contacts")
      .select("id", { count: "exact", head: true })
      .eq("is_archived", false)
      .not("status", "in", '("lost")')
      .lt("last_contact_date", new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0]);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { count: newThisMonth } = await sb()
      .from("crm_contacts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfMonth);

    const { count: activeCount } = await sb()
      .from("crm_contacts")
      .select("id", { count: "exact", head: true })
      .eq("is_archived", false)
      .in("status", ["new", "active"]);

    const { count: futureCount } = await sb()
      .from("crm_contacts")
      .select("id", { count: "exact", head: true })
      .eq("is_archived", false)
      .eq("status", "future");

    // Speed to lead (avg hours from lead created_at to first_replied_at, last 30 days)
    const { data: speedData } = await sb()
      .from("leads")
      .select("created_at, first_replied_at")
      .not("first_replied_at", "is", null)
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());

    let avgSpeedHours = null;
    if (speedData && speedData.length > 0) {
      const totalMs = speedData.reduce((sum, l) => {
        return sum + (new Date(l.first_replied_at) - new Date(l.created_at));
      }, 0);
      avgSpeedHours = Math.round((totalMs / speedData.length) / 3600000 * 10) / 10;
    }

    ok(res, {
      actionContacts: rowsToCamel(actionContacts || []),
      topRelationships: rowsToCamel(topRelationships || []),
      health: {
        overdueActions: overdueCount || 0,
        noContactOver90: noContactCount || 0,
        newThisMonth: newThisMonth || 0,
        activeProspects: activeCount || 0,
        futurePipeline: futureCount || 0,
      },
      speedToLeadHours: avgSpeedHours,
    });
  });

  // ─── Contacts list ────────────────────────────────────────────────────────

  app.get("/api/crm/contacts", requireAuth, async (req, res) => {
    const { status, contact_type, overdue, limit = "50", offset = "0", q } = req.query;

    let query = sb().from("crm_contacts")
      .select("id, first_name, last_name, email, phone, contact_type, status, relationship_score, next_action_type, next_action_due_date, last_contact_date, referral_count, referral_job_value, converted_lead_id, created_at", { count: "exact" })
      .eq("is_archived", false)
      .order("next_action_due_date", { ascending: true, nullsFirst: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq("status", status);
    if (contact_type) query = query.eq("contact_type", contact_type);
    if (overdue === "true") {
      const today = new Date().toISOString().split("T")[0];
      query = query.lt("next_action_due_date", today)
        .neq("next_action_type", "none")
        .neq("next_action_type", "waiting");
    }
    if (q) {
      query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`);
    }

    const { data, count, error } = await query;
    if (error) return err(res, 500, "Failed to load contacts");

    ok(res, { contacts: rowsToCamel(data || []), total: count || 0 });
  });

  // ─── Create contact ───────────────────────────────────────────────────────

  app.post("/api/crm/contacts", requireAuth, async (req, res) => {
    const {
      firstName, lastName, email, phone, contactType = "prospect",
      leadSource, referredByContactId, projectType, budgetRange, suburb, state,
      interestTimeline, status = "new", notes,
      nextActionType = "call", nextActionDueDate, nextActionNotes,
    } = req.body;

    if (!firstName) return err(res, 400, "First name is required");

    // Default next action: new contacts get "call" due tomorrow
    const defaultDueDate = nextActionDueDate || new Date(Date.now() + 86400000).toISOString().split("T")[0];

    const { data, error } = await sb().from("crm_contacts").insert({
      first_name: firstName,
      last_name: lastName || null,
      email: email || null,
      phone: phone || null,
      contact_type: contactType,
      lead_source: leadSource || null,
      referred_by_contact_id: referredByContactId || null,
      project_type: projectType || null,
      budget_range: budgetRange || null,
      suburb: suburb || null,
      state: state || "SA",
      interest_timeline: interestTimeline || null,
      status,
      next_action_type: nextActionType,
      next_action_due_date: defaultDueDate,
      next_action_notes: nextActionNotes || null,
      notes: notes || null,
      created_by: req.user?.id || null,
    }).select().single();

    // Surface the real cause (e.g. an out-of-range status/contact_type/budget_range enum)
    // instead of a generic 500 the user can't act on.
    if (error) return err(res, 400, translateDbError(error));
    ok(res, { contact: rowToCamel(data) });
  });

  // ─── Get single contact ───────────────────────────────────────────────────

  app.get("/api/crm/contacts/:id", requireAuth, async (req, res) => {
    const { id } = req.params;

    const [contactRes, interactionsRes, membershipsRes] = await Promise.all([
      sb().from("crm_contacts").select("*").eq("id", id).single(),
      sb().from("crm_interactions")
        .select("*")
        .eq("contact_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      sb().from("mailing_list_members")
        .select("*, mailing_lists(id, name, list_type)")
        .eq("contact_id", id)
        .order("created_at", { ascending: false }),
    ]);

    if (contactRes.error || !contactRes.data) return err(res, 404, "Contact not found");

    // Smart lists this contact auto-belongs to (computed, read-only — e.g. a referrer
    // is automatically in "Referrers & Partners"). Surfaced so the UI can show it.
    const smartLists = await smartListsForContact(sb(), contactRes.data);

    ok(res, {
      contact: rowToCamel(contactRes.data),
      interactions: rowsToCamel(interactionsRes.data || []),
      listMemberships: rowsToCamel(membershipsRes.data || []),
      smartLists,
    });
  });

  // ─── Update contact ───────────────────────────────────────────────────────

  app.put("/api/crm/contacts/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    const {
      firstName, lastName, email, phone, contactType, leadSource,
      projectType, budgetRange, suburb, state, interestTimeline, status,
      nextActionType, nextActionDueDate, nextActionNotes, lastContactDate, notes,
    } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (firstName !== undefined) updates.first_name = firstName;
    if (lastName !== undefined) updates.last_name = lastName;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (contactType !== undefined) updates.contact_type = contactType;
    if (leadSource !== undefined) updates.lead_source = leadSource;
    if (projectType !== undefined) updates.project_type = projectType;
    if (budgetRange !== undefined) updates.budget_range = budgetRange;
    if (suburb !== undefined) updates.suburb = suburb;
    if (state !== undefined) updates.state = state;
    if (interestTimeline !== undefined) updates.interest_timeline = interestTimeline;
    if (status !== undefined) updates.status = status;
    if (nextActionType !== undefined) updates.next_action_type = nextActionType;
    if (nextActionDueDate !== undefined) updates.next_action_due_date = nextActionDueDate;
    if (nextActionNotes !== undefined) updates.next_action_notes = nextActionNotes;
    if (lastContactDate !== undefined) updates.last_contact_date = lastContactDate;
    if (notes !== undefined) updates.notes = notes;

    const { data, error } = await sb().from("crm_contacts")
      .update(updates).eq("id", id).select().single();

    if (error) return err(res, 500, "Failed to update contact");
    ok(res, { contact: rowToCamel(data) });
  });

  // ─── Log interaction ──────────────────────────────────────────────────────

  app.post("/api/crm/contacts/:id/interact", requireAuth, async (req, res) => {
    const { id } = req.params;
    const {
      interactionType, direction, summary, detail,
      nextFollowUpDate, nextFollowUpNotes,
      nextActionType, nextActionDueDate, nextActionNotes,
    } = req.body;

    if (!interactionType) return err(res, 400, "interactionType is required");
    if (!summary) return err(res, 400, "summary is required");

    // Check if contact has a converted lead without first_replied_at set
    if (direction === "outbound") {
      const { data: contact } = await sb()
        .from("crm_contacts").select("converted_lead_id").eq("id", id).single();

      if (contact?.converted_lead_id) {
        const { data: lead } = await sb()
          .from("leads").select("id, first_replied_at").eq("id", contact.converted_lead_id).single();

        if (lead && !lead.first_replied_at) {
          await sb().from("leads").update({ first_replied_at: new Date().toISOString() })
            .eq("id", lead.id);
        }
      }
    }

    const { data: interaction, error } = await sb().from("crm_interactions").insert({
      contact_id: id,
      interaction_type: interactionType,
      direction: direction || null,
      summary,
      detail: detail || null,
      next_follow_up_date: nextFollowUpDate || null,
      next_follow_up_notes: nextFollowUpNotes || null,
      created_by: req.user?.id || null,
    }).select().single();

    if (error) return err(res, 500, "Failed to log interaction");

    // Update contact: last_contact_date + next action if provided
    const contactUpdates = {
      last_contact_date: new Date().toISOString().split("T")[0],
      updated_at: new Date().toISOString(),
    };
    if (nextActionType !== undefined) contactUpdates.next_action_type = nextActionType;
    if (nextActionDueDate !== undefined) contactUpdates.next_action_due_date = nextActionDueDate;
    if (nextActionNotes !== undefined) contactUpdates.next_action_notes = nextActionNotes;

    await sb().from("crm_contacts").update(contactUpdates).eq("id", id);

    // Recompute relationship score
    const { data: allInteractions } = await sb()
      .from("crm_interactions").select("interaction_type, created_at").eq("contact_id", id);
    const { data: contactData } = await sb()
      .from("crm_contacts").select("referral_count, referral_job_value, status").eq("id", id).single();

    if (contactData) {
      const newScore = scoreContact(
        allInteractions || [],
        contactData.referral_count,
        contactData.referral_job_value,
        contactData.status
      );
      await sb().from("crm_contacts").update({
        relationship_score: newScore,
        relationship_score_updated_at: new Date().toISOString(),
      }).eq("id", id);
    }

    ok(res, { interaction: rowToCamel(interaction) });
  });

  // ─── Convert to lead ──────────────────────────────────────────────────────

  app.post("/api/crm/contacts/:id/convert", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { estimatedValue, projectType, suburb, budgetRange, notes } = req.body;

    const { data: contact, error: cErr } = await sb()
      .from("crm_contacts").select("*").eq("id", id).single();
    if (cErr || !contact) return err(res, 404, "Contact not found");

    if (contact.converted_lead_id) {
      return err(res, 409, "Contact has already been converted to a lead");
    }

    // Create a lead from the contact
    const { data: lead, error: lErr } = await sb().from("leads").insert({
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: contact.email,
      phone: contact.phone,
      suburb: suburb || contact.suburb,
      project_type: projectType || contact.project_type,
      estimated_value: estimatedValue || null,
      lead_source: contact.lead_source,
      referred_by_contact_id: id,
      discovery_notes: notes || null,
      stage: "enquiry",
    }).select().single();

    if (lErr) return err(res, 500, translateDbError(lErr));

    // Update contact
    await sb().from("crm_contacts").update({
      converted_lead_id: lead.id,
      converted_at: new Date().toISOString(),
      status: "active",
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    ok(res, { lead: rowToCamel(lead) });
  });

  // ─── Job ↔ contact roles (Party spine) — FINANCE/ADMIN ONLY ────────────────
  //
  // ⚠️ COST / MARGIN-SENSITIVE. Consulting fees live here. EVERY endpoint below is
  // requireAuth + requireRole("admin"). Non-admin users must never see fees.
  // Amounts are EX-GST (CLAUDE.md § Amounts). camelCase across the boundary.

  // A contact's roles across all jobs + a computed value/fees summary.
  app.get("/api/crm/contacts/:id/job-roles", requireAuth, requireRole("admin"), async (req, res) => {
    const { id } = req.params;

    const { data: roles, error } = await sb()
      .from("job_contact_roles")
      .select("*, jobs(id, address)")
      .eq("contact_id", id)
      .order("created_at", { ascending: false });
    if (error) return err(res, 500, "Failed to load contact job roles");

    // Summary:
    //   valueBroughtIn  = Σ over DISTINCT credited jobs of the CANONICAL contract value
    //                     (Phase 5 fact = original + Σ signed variations) — N2 fix: not the
    //                     stale stored jobs.contract_value (post-mig-079 it omits post-win variations).
    //   consultingFees  = Σ fee_amount across ALL the contact's roles
    //   jobsCount       = number of DISTINCT credited jobs
    // A job credited once is counted once even with multiple roles on it.
    const creditedJobIds = new Set();
    let consultingFees = 0;
    for (const r of roles || []) {
      consultingFees += Number(r.fee_amount || 0);
      if (r.credits_referral && r.job_id) creditedJobIds.add(r.job_id);
    }
    let valueBroughtIn = 0;
    for (const jid of creditedJobIds) {
      valueBroughtIn += await getCanonicalContractValue(jid);
    }

    ok(res, {
      roles: rowsToCamel(roles || []),
      summary: {
        valueBroughtIn,
        consultingFees,
        jobsCount: creditedJobIds.size,
      },
    });
  });

  // Add a role to a job (consultant/referrer/etc.). Defaults creditsReferral=true
  // for role='referrer'. Recomputes the contact's referral rollup after insert.
  app.post("/api/crm/jobs/:jobId/contact-roles", requireAuth, requireRole("admin"), async (req, res) => {
    const { jobId } = req.params;
    const {
      contactId, role, status = "active", startDate, endDate,
      feeAmount, creditsReferral, feeArrangement, notes,
    } = req.body;

    if (!contactId) return err(res, 400, "contactId is required");
    if (!role) return err(res, 400, "role is required");

    const credits = creditsReferral !== undefined ? !!creditsReferral : role === "referrer";

    const { data, error } = await sb().from("job_contact_roles").insert({
      job_id: jobId,
      contact_id: contactId,
      role,
      status,
      start_date: startDate || null,
      end_date: endDate || null,
      fee_amount: feeAmount != null && feeAmount !== "" ? Number(feeAmount) : null,
      credits_referral: credits,
      fee_arrangement: feeArrangement || null,
      notes: notes || null,
      created_by: req.caller?.id || null,
    }).select().single();

    if (error) return err(res, 400, translateDbError(error));

    await recomputeReferralRollup(sb(), contactId);
    ok(res, { role: rowToCamel(data) });
  });

  // Edit any field on a role; recompute the affected contact's rollup.
  app.put("/api/crm/contact-roles/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const { id } = req.params;
    const {
      role, status, startDate, endDate,
      feeAmount, creditsReferral, feeArrangement, notes,
    } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (role !== undefined) updates.role = role;
    if (status !== undefined) updates.status = status;
    if (startDate !== undefined) updates.start_date = startDate || null;
    if (endDate !== undefined) updates.end_date = endDate || null;
    if (feeAmount !== undefined) updates.fee_amount = feeAmount != null && feeAmount !== "" ? Number(feeAmount) : null;
    if (creditsReferral !== undefined) updates.credits_referral = !!creditsReferral;
    if (feeArrangement !== undefined) updates.fee_arrangement = feeArrangement || null;
    if (notes !== undefined) updates.notes = notes || null;

    const { data, error } = await sb()
      .from("job_contact_roles").update(updates).eq("id", id).select().single();
    if (error) return err(res, 400, translateDbError(error));

    if (data?.contact_id) await recomputeReferralRollup(sb(), data.contact_id);
    ok(res, { role: rowToCamel(data) });
  });

  // Remove a role; recompute the affected contact's rollup.
  app.delete("/api/crm/contact-roles/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const { id } = req.params;

    const { data, error } = await sb()
      .from("job_contact_roles").delete().eq("id", id).select("contact_id").single();
    if (error) return err(res, 500, "Failed to remove role");

    if (data?.contact_id) await recomputeReferralRollup(sb(), data.contact_id);
    ok(res);
  });

  // Everyone with a role on a given job (for the finance command-centre panel).
  app.get("/api/crm/jobs/:jobId/contact-roles", requireAuth, requireRole("admin"), async (req, res) => {
    const { jobId } = req.params;

    const { data, error } = await sb()
      .from("job_contact_roles")
      .select("*, crm_contacts(id, first_name, last_name, contact_type, email, phone)")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    if (error) return err(res, 500, "Failed to load job roles");

    ok(res, { roles: rowsToCamel(data || []) });
  });

  // ─── Unified search ───────────────────────────────────────────────────────

  app.get("/api/crm/search", requireAuth, async (req, res) => {
    const { q = "" } = req.query;
    if (!q.trim()) return ok(res, { results: [] });

    const [contactsRes, leadsRes] = await Promise.all([
      sb().from("crm_contacts")
        .select("id, first_name, last_name, email, contact_type, status")
        .eq("is_archived", false)
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(10),
      sb().from("leads")
        .select("id, first_name, last_name, email, stage")
        .not("stage", "in", '("lost")')
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(10),
    ]);

    const results = [
      ...(contactsRes.data || []).map(c => ({ ...rowToCamel(c), _type: "contact" })),
      ...(leadsRes.data || []).map(l => ({ ...rowToCamel(l), _type: "lead" })),
    ];

    ok(res, { results });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // MAILING LISTS
  // ════════════════════════════════════════════════════════════════════════════

  // ─── List all mailing lists ───────────────────────────────────────────────

  app.get("/api/crm/lists", requireAuth, async (req, res) => {
    const { data: lists, error } = await sb()
      .from("mailing_lists")
      .select("*")
      .eq("is_archived", false)
      .order("created_at", { ascending: true });

    if (error) return err(res, 500, "Failed to load lists");

    // Compute live member counts for smart lists
    const listsWithCounts = await Promise.all((lists || []).map(async (list) => {
      let activeMembers = 0;
      let totalMembers = 0;

      if (list.list_type === "smart") {
        const members = await smartListMembers(sb(), list.smart_filter || {});
        totalMembers = members.length;
        activeMembers = members.length; // smart lists exclude archived already
      } else {
        const { count: total } = await sb()
          .from("mailing_list_members")
          .select("id", { count: "exact", head: true })
          .eq("list_id", list.id);
        const { count: active } = await sb()
          .from("mailing_list_members")
          .select("id", { count: "exact", head: true })
          .eq("list_id", list.id)
          .is("unsubscribed_at", null);
        totalMembers = total || 0;
        activeMembers = active || 0;
      }

      return { ...rowToCamel(list), totalMembers, activeMembers };
    }));

    ok(res, { lists: listsWithCounts });
  });

  // ─── Create list ──────────────────────────────────────────────────────────

  app.post("/api/crm/lists", requireAuth, async (req, res) => {
    const { name, description, listType = "manual", smartFilter } = req.body;
    if (!name) return err(res, 400, "List name is required");

    const { data, error } = await sb().from("mailing_lists").insert({
      name,
      description: description || null,
      list_type: listType,
      smart_filter: smartFilter || null,
      created_by: req.user?.id || null,
    }).select().single();

    if (error) return err(res, 500, "Failed to create list");
    ok(res, { list: rowToCamel(data) });
  });

  // ─── Get list with members ────────────────────────────────────────────────

  app.get("/api/crm/lists/:id", requireAuth, async (req, res) => {
    const { id } = req.params;

    const { data: list, error } = await sb()
      .from("mailing_lists").select("*").eq("id", id).single();
    if (error || !list) return err(res, 404, "List not found");

    let members = [];
    if (list.list_type === "smart") {
      const ids = await smartListMembers(sb(), list.smart_filter || {});
      if (ids.length) {
        const { data: contacts } = await sb()
          .from("crm_contacts")
          .select("id, first_name, last_name, email, contact_type, status, relationship_score, last_contact_date, created_at")
          .in("id", ids.map(r => r.id));
        members = rowsToCamel(contacts || []).map(c => ({ ...c, isSmart: true }));
      }
    } else {
      const { data: rows } = await sb()
        .from("mailing_list_members")
        .select("*, crm_contacts(id, first_name, last_name, email, contact_type, status, relationship_score)")
        .eq("list_id", id)
        .order("created_at", { ascending: false });
      members = rowsToCamel(rows || []);
    }

    ok(res, { list: rowToCamel(list), members });
  });

  // ─── Add member to list ───────────────────────────────────────────────────

  app.post("/api/crm/lists/:id/members", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { contactId, consentSource, consentNotes } = req.body;

    if (!contactId) return err(res, 400, "contactId is required");
    if (!consentSource) return err(res, 400, "consentSource is required (Spam Act compliance)");

    const { data, error } = await sb().from("mailing_list_members").insert({
      list_id: id,
      contact_id: contactId,
      consent_source: consentSource,
      consent_notes: consentNotes || null,
      added_by: req.user?.id || null,
    }).select().single();

    if (error) {
      if (error.code === "23505") return err(res, 409, "Contact is already on this list");
      return err(res, 500, "Failed to add member");
    }

    ok(res, { member: rowToCamel(data) });
  });

  // ─── Remove (unsubscribe) member from list ────────────────────────────────

  app.delete("/api/crm/lists/:id/members/:mid", requireAuth, async (req, res) => {
    const { id, mid } = req.params;

    // email lives on crm_contacts, not mailing_list_members (H13) — join it for the audit trail.
    const { data: member } = await sb()
      .from("mailing_list_members").select("*, crm_contacts(email)").eq("id", mid).eq("list_id", id).single();

    if (!member) return err(res, 404, "Member not found");

    // Soft unsubscribe
    await sb().from("mailing_list_members").update({
      unsubscribed_at: new Date().toISOString(),
      unsubscribed_via: "manual",
    }).eq("id", mid);

    // Spam Act audit trail
    await sb().from("email_unsubscribes").insert({
      contact_id: member.contact_id,
      email_address: member.crm_contacts?.email || "",
      list_id: id,
      unsubscribed_via: "manual",
    });

    ok(res);
  });

  // ─── CSV import ───────────────────────────────────────────────────────────

  app.post("/api/crm/lists/:id/import", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { rows } = req.body; // [{ firstName, lastName, email, phone, contactType, consentSource, suburb }]

    if (!Array.isArray(rows) || rows.length === 0) return err(res, 400, "rows[] is required");

    const results = { created: 0, updated: 0, added: 0, skipped: 0, errors: [] };

    for (const row of rows) {
      if (!row.email) { results.skipped++; results.errors.push(`Row missing email: ${row.firstName || "?"}`); continue; }
      if (!row.consentSource) { results.skipped++; results.errors.push(`Row missing consentSource: ${row.email}`); continue; }

      // Upsert contact by email
      const { data: existing } = await sb()
        .from("crm_contacts").select("id").eq("email", row.email).maybeSingle();

      let contactId = existing?.id;
      if (!contactId) {
        const { data: created, error: cErr } = await sb().from("crm_contacts").insert({
          first_name: row.firstName || row.email,
          last_name: row.lastName || null,
          email: row.email,
          phone: row.phone || null,
          contact_type: row.contactType || "prospect",
          suburb: row.suburb || null,
          status: "new",
          next_action_type: "call",
          next_action_due_date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
          created_by: req.user?.id || null,
        }).select("id").single();

        if (cErr) { results.skipped++; results.errors.push(`Failed to create ${row.email}`); continue; }
        contactId = created.id;
        results.created++;
      } else {
        results.updated++;
      }

      // Add to list
      const { error: mErr } = await sb().from("mailing_list_members").upsert({
        list_id: id,
        contact_id: contactId,
        consent_source: row.consentSource,
        consent_notes: row.consentNotes || null,
        added_by: req.user?.id || null,
      }, { onConflict: "list_id,contact_id", ignoreDuplicates: true });

      if (!mErr) results.added++;
    }

    ok(res, { results });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // EMAIL SENDS
  // ════════════════════════════════════════════════════════════════════════════

  // ─── List sends for a list ────────────────────────────────────────────────

  app.get("/api/crm/lists/:id/sends", requireAuth, async (req, res) => {
    const { data, error } = await sb()
      .from("email_sends")
      .select("*")
      .eq("mailing_list_id", req.params.id)
      .order("created_at", { ascending: false });

    if (error) return err(res, 500, "Failed to load sends");
    ok(res, { sends: rowsToCamel(data || []) });
  });

  // ─── Create email send draft ──────────────────────────────────────────────

  app.post("/api/crm/sends", requireAuth, async (req, res) => {
    const { mailingListId, subject, previewText, htmlBody, contentItemId, scheduledAt } = req.body;
    if (!mailingListId) return err(res, 400, "mailingListId is required");
    if (!subject) return err(res, 400, "subject is required");

    const { data, error } = await sb().from("email_sends").insert({
      mailing_list_id: mailingListId,
      subject,
      preview_text: previewText || null,
      html_body: htmlBody || null,
      content_item_id: contentItemId || null,
      scheduled_at: scheduledAt || null,
      status: scheduledAt ? "scheduled" : "draft",
      created_by: req.user?.id || null,
    }).select().single();

    if (error) return err(res, 500, "Failed to create email send");
    ok(res, { send: rowToCamel(data) });
  });

  // ─── Update send draft ────────────────────────────────────────────────────

  app.put("/api/crm/sends/:sid", requireAuth, async (req, res) => {
    const { sid } = req.params;
    const { subject, previewText, htmlBody, scheduledAt } = req.body;

    const { data: existing } = await sb()
      .from("email_sends").select("status").eq("id", sid).single();
    if (!existing) return err(res, 404, "Send not found");
    if (!["draft", "scheduled"].includes(existing.status)) {
      return err(res, 409, "Cannot edit a send that has already been sent");
    }

    const updates = { updated_at: new Date().toISOString() };
    if (subject !== undefined) updates.subject = subject;
    if (previewText !== undefined) updates.preview_text = previewText;
    if (htmlBody !== undefined) updates.html_body = htmlBody;
    if (scheduledAt !== undefined) {
      updates.scheduled_at = scheduledAt;
      updates.status = scheduledAt ? "scheduled" : "draft";
    }

    const { data, error } = await sb().from("email_sends")
      .update(updates).eq("id", sid).select().single();

    if (error) return err(res, 500, "Failed to update send");
    ok(res, { send: rowToCamel(data) });
  });

  // ─── Trigger send ─────────────────────────────────────────────────────────

  app.post("/api/crm/sends/:sid/send", requireAuth, async (req, res) => {
    const { sid } = req.params;

    if (!process.env.RESEND_API_KEY) {
      return err(res, 503, "Email sending is not configured yet. Add RESEND_API_KEY to Railway environment variables to enable this feature.");
    }

    const { data: send, error: sErr } = await sb()
      .from("email_sends").select("*").eq("id", sid).single();
    if (sErr || !send) return err(res, 404, "Send not found");
    if (send.status === "sent") return err(res, 409, "This send has already been sent");

    const { data: list } = await sb()
      .from("mailing_lists").select("*").eq("id", send.mailing_list_id).single();
    if (!list) return err(res, 404, "Mailing list not found");

    // Get active members
    let recipients = [];
    if (list.list_type === "smart") {
      const memberIds = await smartListMembers(sb(), list.smart_filter || {});
      if (memberIds.length) {
        const { data: contacts } = await sb()
          .from("crm_contacts")
          .select("id, email, first_name, last_name")
          .in("id", memberIds.map(r => r.id))
          .not("email", "is", null);
        recipients = contacts || [];
      }
    } else {
      const { data: members } = await sb()
        .from("mailing_list_members")
        .select("contact_id, crm_contacts(id, email, first_name, last_name)")
        .eq("list_id", send.mailing_list_id)
        .is("unsubscribed_at", null);

      recipients = (members || [])
        .map(m => m.crm_contacts)
        .filter(c => c && c.email);
    }

    if (recipients.length === 0) return err(res, 400, "No active recipients with email addresses on this list");

    // Mark as sending
    await sb().from("email_sends").update({
      status: "sending",
      total_recipients: recipients.length,
      updated_at: new Date().toISOString(),
    }).eq("id", sid);

    // Create recipient rows (keep ids so we can store Resend's per-email id for webhook matching, H13)
    const recipientRows = recipients.map(r => ({
      email_send_id: sid,
      contact_id: r.id,
      email_address: r.email,
      status: "pending",
    }));
    const { data: insertedRecipients } = await sb()
      .from("email_send_recipients").insert(recipientRows).select("id, contact_id");
    const recipientRowIdByContact = new Map((insertedRecipients || []).map(x => [x.contact_id, x.id]));

    // Build unsubscribe-footer HTML
    const unsubFooter = (contactId, listId) => {
      const token = jwt.sign(
        { contactId, listId, sendId: sid },
        UNSUBSCRIBE_SECRET,
        { expiresIn: "90d" }
      );
      const unsubUrl = `${process.env.APP_URL || "https://hub.blueleafbuilding.com.au"}/api/crm/unsubscribe?token=${token}`;
      return `
        <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:12px;color:#6b7280;text-align:center;">
          <strong>Blue Leaf Building</strong><br/>
          Adelaide, South Australia<br/><br/>
          You're receiving this email because you're on our mailing list.<br/>
          <a href="${unsubUrl}" style="color:#006c9b;">Unsubscribe</a>
        </div>`;
    };

    // Send via Resend
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    const emails = recipients.map(r => ({
      from: `${send.from_name} <${send.from_email}>`,
      to: r.email,
      subject: send.subject,
      html: (send.html_body || "") + unsubFooter(r.id, send.mailing_list_id),
    }));

    try {
      const batchResult = await resend.batch.send(emails);
      // Resend returns per-email ids in input order. Store each on its recipient row so the
      // webhook (which matches on resend_email_id) can attribute delivery/open/bounce events (H13).
      const sentItems = Array.isArray(batchResult?.data)
        ? batchResult.data
        : (Array.isArray(batchResult?.data?.data) ? batchResult.data.data : []);
      // Resend reports failures in the result object (it doesn't throw). If the provider rejected
      // the batch — or returned no delivery IDs — mark the send failed rather than silently "sent"
      // (which would leave recipients stuck "pending" with no resend_email_id to match webhooks).
      if (batchResult?.error || (recipients.length > 0 && sentItems.length === 0)) {
        await sb().from("email_sends").update({
          status: "failed",
          updated_at: new Date().toISOString(),
        }).eq("id", sid);
        return err(res, 502, "Email send failed — " + friendlyResendError(batchResult?.error?.message));
      }
      for (let i = 0; i < recipients.length; i++) {
        const resendId = sentItems[i]?.id;
        const recRowId = recipientRowIdByContact.get(recipients[i].id);
        if (resendId && recRowId) {
          await sb().from("email_send_recipients")
            .update({ resend_email_id: resendId }).eq("id", recRowId);
        }
      }
      await sb().from("email_sends").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        resend_batch_id: batchResult?.data?.id || null,
        updated_at: new Date().toISOString(),
      }).eq("id", sid);

      ok(res, { sent: recipients.length });
    } catch (sendErr) {
      await sb().from("email_sends").update({
        status: "failed",
        updated_at: new Date().toISOString(),
      }).eq("id", sid);
      return err(res, 500, "Email send failed — " + friendlyResendError(sendErr.message));
    }
  });

  // ─── Cancel scheduled send ────────────────────────────────────────────────

  app.post("/api/crm/sends/:sid/cancel", requireAuth, async (req, res) => {
    const { data, error } = await sb().from("email_sends")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", req.params.sid)
      .eq("status", "scheduled")
      .select().single();

    if (error || !data) return err(res, 404, "Scheduled send not found");
    ok(res);
  });

  // ─── Per-recipient delivery table ─────────────────────────────────────────

  app.get("/api/crm/sends/:sid/recipients", requireAuth, async (req, res) => {
    const { data, error } = await sb()
      .from("email_send_recipients")
      .select("*, crm_contacts(first_name, last_name)")
      .eq("email_send_id", req.params.sid)
      .order("created_at", { ascending: true });

    if (error) return err(res, 500, "Failed to load recipients");
    ok(res, { recipients: rowsToCamel(data || []) });
  });

  // ─── Unsubscribe (public, no auth) ────────────────────────────────────────

  app.get("/api/crm/unsubscribe", async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).send("Invalid unsubscribe link");

    let payload;
    try {
      payload = jwt.verify(token, UNSUBSCRIBE_SECRET);
    } catch {
      return res.status(400).send("This unsubscribe link has expired. Please contact us at marketing@blueleafbuilding.com.au to unsubscribe.");
    }

    const { contactId, listId, sendId } = payload;

    await getServiceSupabase().from("mailing_list_members").update({
      unsubscribed_at: new Date().toISOString(),
      unsubscribed_via: "link",
    }).eq("contact_id", contactId).eq("list_id", listId);

    const { data: contact } = await getServiceSupabase()
      .from("crm_contacts").select("email").eq("id", contactId).single();

    await getServiceSupabase().from("email_unsubscribes").insert({
      contact_id: contactId,
      email_address: contact?.email || "",
      list_id: listId,
      email_send_id: sendId || null,
      unsubscribed_via: "link",
    });

    res.send(`
      <!DOCTYPE html><html><head><title>Unsubscribed</title>
      <style>body{font-family:Arial,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#374151;}
      h2{color:#006c9b;}p{color:#6b7280;}</style></head>
      <body><h2>You've been unsubscribed</h2>
      <p>You've been removed from this mailing list and won't receive further emails from this list.</p>
      <p style="margin-top:24px;font-size:12px;">Blue Leaf Building · Adelaide, South Australia</p>
      </body></html>`);
  });

  // ─── Resend webhook ───────────────────────────────────────────────────────

  app.post("/api/webhooks/resend", async (req, res) => {
    // In production: verify Resend-Signature header
    const { type, data } = req.body || {};
    if (!type || !data) return res.sendStatus(200);

    const emailId = data.email_id;

    try {
      if (type === "email.delivered") {
        await getServiceSupabase().from("email_send_recipients")
          .update({ status: "delivered", delivered_at: new Date().toISOString() })
          .eq("resend_email_id", emailId);
        // Increment delivered_count on send
        await getServiceSupabase().rpc("increment_send_stat", { p_resend_email_id: emailId, p_field: "delivered_count" }).maybeSingle();

      } else if (type === "email.opened") {
        await getServiceSupabase().from("email_send_recipients")
          .update({ status: "opened", opened_at: new Date().toISOString() })
          .eq("resend_email_id", emailId);
        await getServiceSupabase().rpc("increment_send_stat", { p_resend_email_id: emailId, p_field: "opened_count" }).maybeSingle();

      } else if (type === "email.clicked") {
        await getServiceSupabase().from("email_send_recipients")
          .update({ status: "clicked", clicked_at: new Date().toISOString() })
          .eq("resend_email_id", emailId);
        await getServiceSupabase().rpc("increment_send_stat", { p_resend_email_id: emailId, p_field: "clicked_count" }).maybeSingle();

      } else if (type === "email.bounced") {
        await getServiceSupabase().from("email_send_recipients")
          .update({ status: "bounced", bounce_reason: data.bounce?.message || null })
          .eq("resend_email_id", emailId);
        await getServiceSupabase().rpc("increment_send_stat", { p_resend_email_id: emailId, p_field: "bounced_count" }).maybeSingle();

        // Hard bounce = remove from all lists
        const { data: recipient } = await getServiceSupabase()
          .from("email_send_recipients").select("contact_id, email_address").eq("resend_email_id", emailId).maybeSingle();
        if (recipient?.contact_id) {
          await getServiceSupabase().from("mailing_list_members")
            .update({ unsubscribed_at: new Date().toISOString(), unsubscribed_via: "bounce" })
            .eq("contact_id", recipient.contact_id);
        }

      } else if (type === "email.complained") {
        const { data: recipient } = await getServiceSupabase()
          .from("email_send_recipients").select("contact_id, email_address, email_send_id").eq("resend_email_id", emailId).maybeSingle();

        if (recipient?.contact_id) {
          await getServiceSupabase().from("mailing_list_members")
            .update({ unsubscribed_at: new Date().toISOString(), unsubscribed_via: "complaint" })
            .eq("contact_id", recipient.contact_id);

          await getServiceSupabase().from("email_unsubscribes").insert({
            contact_id: recipient.contact_id,
            email_address: recipient.email_address || "",
            email_send_id: recipient.email_send_id || null,
            unsubscribed_via: "complaint",
            resend_event_id: data.event_id || null,
          });
          await getServiceSupabase().rpc("increment_send_stat", { p_resend_email_id: emailId, p_field: "complained_count" }).maybeSingle();
        }

      } else if (type === "email.unsubscribed") {
        const { data: recipient } = await getServiceSupabase()
          .from("email_send_recipients").select("contact_id, email_address, email_send_id").eq("resend_email_id", emailId).maybeSingle();

        if (recipient?.contact_id) {
          await getServiceSupabase().from("mailing_list_members")
            .update({ unsubscribed_at: new Date().toISOString(), unsubscribed_via: "link" })
            .eq("contact_id", recipient.contact_id);
          await getServiceSupabase().from("email_unsubscribes").insert({
            contact_id: recipient.contact_id,
            email_address: recipient.email_address || "",
            email_send_id: recipient.email_send_id || null,
            unsubscribed_via: "link",
            resend_event_id: data.event_id || null,
          });
          await getServiceSupabase().rpc("increment_send_stat", { p_resend_email_id: emailId, p_field: "unsubscribed_count" }).maybeSingle();
        }
      }
    } catch (e) {
      // Log but don't fail — Resend will retry
      console.error("Resend webhook error:", e.message);
    }

    res.sendStatus(200);
  });
}

/**
 * Blue Leaf Building — Document Token System
 *
 * Canonical mapping between [insert_*] template placeholders and live data.
 * Used by every generated document: progress claims, variations, fee proposals,
 * handover packs, client portal updates, warranty packs.
 *
 * Template format: [insert_token_name]
 * To fill a DOCX template: replace each [insert_x] with tokens[x]
 * To fill a PDF renderer: pass the tokens object directly
 *
 * Data path conventions (for documentation — actual values resolved in builders):
 *   job.*            → jobs table row
 *   claim.*          → progress_claims row
 *   variation.*      → job_variations row
 *   schedule.*       → derived from schedule_tasks
 *   financial.*      → computed KPIs (contract value, margins, etc.)
 *   siteDiary.*      → latest site_diary entry
 */

const fmtAud = n =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);

const fmtPct = n =>
  n == null || !Number.isFinite(Number(n)) ? "—" : `${Number(n).toFixed(1)}%`;

const fmtDate = iso => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
};

const fmtDateShort = iso => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
};

function marginStatus(pct, target, floor) {
  if (pct == null) return "—";
  if (pct >= (target || 40) + 1) return "🟢 On track";
  if (pct >= (target || 40) - 1) return "🟡 Watch";
  if (pct >= (floor || 33)) return "🔴 Below target";
  return "🔴 Critical — below floor";
}

// ─── Progress Claim tokens ────────────────────────────────────────────────────

/**
 * Builds the full flat token map for a progress claim document.
 *
 * @param {object} claim      - progress_claims row
 * @param {object} job        - jobs row (address, client_name, original_contract_value, …)
 * @param {object} ctx        - derived context:
 *   signedVariationsTotal, originalContract, revisedContract,
 *   previousClaimsTotal, claimedStages (Set), issuedDate, dueDate,
 *   variations (array of job_variations),
 *   budgetActuals (array of {name, budget_amount, actual_amount, forecast_amount, variance, status}),
 *   kpis (optional — {actual_costs, working_margin_pct, forecast_margin_pct}),
 *   pctComplete (optional — 0–100 number)
 */
export function buildProgressClaimTokens(claim, job, ctx = {}) {
  const {
    signedVariationsTotal = 0,
    originalContract = 0,
    revisedContract = 0,
    previousClaimsTotal = 0,
    claimedStages = new Set(),
    issuedDate,
    dueDate,
    variations = [],
    budgetActuals = [],
    kpis = {},
    pctComplete = null,
  } = ctx;

  const amountEx = Number(claim.amount_ex_gst || 0);
  const gst = amountEx * 0.1;
  const amountInc = amountEx * 1.1;
  const cumulative = Number(claim.cumulative_claimed || amountEx + previousClaimsTotal);
  const claimDate = issuedDate || claim.issued_date || new Date().toISOString().slice(0, 10);
  const claimDue  = dueDate   || claim.due_date   || "";

  // Milestone completion — inferred from claimedStages + current claim
  const MILESTONES = [
    { key: "site_works",           label: "Site Works" },
    { key: "slab",                 label: "Slab" },
    { key: "frame",                label: "Frame" },
    { key: "lock_up",              label: "Lock-Up" },
    { key: "fixing",               label: "Internal Finishes" },
    { key: "practical_completion", label: "Handover" },
  ];

  function milestoneStatus(key) {
    if (claimedStages.has(key)) return "Complete ✓";
    if (claim.stage === key)    return "In Progress";
    // Determine if it's before or after the current stage in sequence
    const seq = MILESTONES.map(m => m.key);
    const currentIdx = seq.indexOf(claim.stage);
    const thisIdx    = seq.indexOf(key);
    return thisIdx < currentIdx ? "Complete ✓" : "Pending";
  }

  // Next milestone (first after current that hasn't been claimed)
  const seq = MILESTONES.map(m => m.key);
  const currentIdx = seq.indexOf(claim.stage);
  const nextMilestone = MILESTONES.find(m => seq.indexOf(m.key) > currentIdx && !claimedStages.has(m.key));

  // Variations for register table
  const variationRows = variations.map(v => ({
    number: `#${v.variation_number}`,
    description: v.title || v.description || "—",
    value: fmtAud(v.amount_ex_gst),
    status: v.status === "signed" ? "Approved" : v.status === "sent_to_client" ? "Pending" : v.status === "rejected" ? "Rejected" : "Draft"
  }));

  return {
    // ── Project ──────────────────────────────────────────────────────
    project_name:         job.address || "—",
    project_number:       job.id ? job.id.slice(0, 8).toUpperCase() : "—",
    client_name:          job.client_name || "—",
    site_address:         job.address || "—",

    // ── Claim ────────────────────────────────────────────────────────
    claim_number:         String(claim.claim_number || ""),
    claim_date:           fmtDate(claimDate),
    claim_date_short:     fmtDateShort(claimDate),
    claim_period:         `${fmtDateShort(claimDate)} — ${fmtDateShort(claimDue)}`,
    claim_reference:      claim.claim_reference || `PC${claim.claim_number}`,
    due_date:             fmtDate(claimDue),
    due_date_short:       fmtDateShort(claimDue),
    current_stage:        STAGE_LABELS[claim.stage] || claim.stage || "—",
    description:          claim.description || "",
    project_manager:      job.project_manager || "Blue Leaf Building",

    // ── Financial summary ────────────────────────────────────────────
    original_contract:    fmtAud(originalContract),
    approved_variations:  fmtAud(signedVariationsTotal),
    revised_contract:     fmtAud(revisedContract),

    // ── Progress ─────────────────────────────────────────────────────
    progress_percent:     claim.percentage_claimed != null ? `${Number(claim.percentage_claimed).toFixed(1)}%` : "—",
    build_completion:     pctComplete != null ? `${Number(pctComplete).toFixed(0)}%` : "—",
    next_milestone:       nextMilestone?.label || "Practical Completion",

    // ── Current claim amounts ────────────────────────────────────────
    current_claim_ex:     fmtAud(amountEx),
    gst:                  fmtAud(gst),
    current_claim_inc:    fmtAud(amountInc),
    previous_claims_ex:   fmtAud(previousClaimsTotal),
    previous_claims_inc:  fmtAud(previousClaimsTotal * 1.1),
    previous_claims:      fmtAud(previousClaimsTotal),   // ex GST — label accordingly in templates
    claimed_to_date:      fmtAud(cumulative * 1.1),   // inc GST
    value_complete:       fmtAud(cumulative),           // ex GST
    pct_claimed:          revisedContract > 0 ? fmtPct((cumulative / revisedContract) * 100) : "—",
    contract_value:       fmtAud(originalContract),
    revised_contract_value: fmtAud(revisedContract),

    // ── Milestone statuses (client-facing) ───────────────────────────
    status_site_works:    milestoneStatus("site_works"),
    status_slab:          milestoneStatus("slab"),
    status_frame:         milestoneStatus("frame"),
    status_lock_up:       milestoneStatus("lock_up"),
    status_fixing:        milestoneStatus("fixing"),
    status_handover:      milestoneStatus("practical_completion"),

    // ── Financial Intelligence (internal only) ───────────────────────
    actual_costs:         fmtAud(kpis.actual_costs),
    working_margin:       fmtPct(kpis.working_margin_pct),
    forecast_margin:      fmtPct(kpis.forecast_margin_pct),
    margin_status:        marginStatus(kpis.working_margin_pct, job.target_margin_pct, job.floor_margin_pct),

    // ── Weekly update / notes (client-facing) ────────────────────────
    weekly_summary:       claim.description || "Work progressing on site as per programme.",
    client_message:       claim.description || "",

    // ── Photo placeholders ───────────────────────────────────────────
    photo_1: "[Photo 1 — attach site photo]",
    photo_2: "[Photo 2 — attach site photo]",
    photo_3: "[Photo 3 — attach site photo]",
    photo_4: "[Photo 4 — attach site photo]",

    // ── Payment details ──────────────────────────────────────────────
    bank_name:           "Bank SA",
    account_name:        "Blue Leaf Building Pty Ltd",
    bsb:                 "105-052",
    account_number:      "261 694 461",
    payment_terms:       "14 days from claim date",
    payment_reference:   `PC${claim.claim_number} — ${(job.address || "").split(",")[0]}`,

    // ── Company ──────────────────────────────────────────────────────
    company_name:        "Manning and Morris Pty Ltd trading as Blue Leaf Building",
    company_abn:         process.env.COMPANY_ABN ? `ABN: ${process.env.COMPANY_ABN}` : "ABN: [REQUIRED — set COMPANY_ABN env var]",
    company_license:     process.env.COMPANY_LICENSE ? `Lic: ${process.env.COMPANY_LICENSE}` : "",
    company_email:       "accounts@blueleafbuilding.com.au",

    // ── Structured arrays (for table rendering in PDF functions) ─────
    _variations:         variationRows,
    _budgetActuals:      budgetActuals,
    _milestones:         MILESTONES.map(m => ({ ...m, status: milestoneStatus(m.key) })),
  };
}

// Stage label lookup (shared across documents)
export const STAGE_LABELS = {
  deposit:              "Deposit",
  slab:                 "Slab",
  frame:                "Frame",
  lock_up:              "Lock-up",
  fixing:               "Fixing",
  practical_completion: "Practical Completion",
  custom:               "Custom",
};

// ─── Future token builders (stubs — expand when templates are ready) ─────────

/**
 * Builds tokens for a variation document.
 * @param {object} variation  - job_variations row
 * @param {object} job        - jobs row
 */
export function buildVariationTokens(variation, job) {
  const amountEx = Number(variation.amount_ex_gst || 0);
  return {
    project_name:         job.address || "—",
    client_name:          job.client_name || "—",
    variation_number:     String(variation.variation_number || ""),
    variation_reference:  variation.variation_reference || `VAR-${variation.variation_number}`,
    variation_title:      variation.title || "—",
    variation_description: variation.description || "",
    variation_date:       fmtDate(variation.created_at),
    trade:                variation.trade_category_name || "—",
    cost_to_builder:      fmtAud(variation.cost_to_builder),
    amount_ex:            fmtAud(amountEx),
    gst:                  fmtAud(amountEx * 0.1),
    amount_inc:           fmtAud(amountEx * 1.1),
    eot_days:             variation.eot_days ? `${variation.eot_days} days` : "Nil",
    company_name:         "Manning and Morris Pty Ltd trading as Blue Leaf Building",
    company_abn:          "ABN: [insert ABN]",
    _lineItems:           variation.line_items || [],
  };
}

/**
 * Builds tokens for a handover pack / defects document.
 * Stub — expand when Sam supplies the template.
 */
export function buildHandoverTokens(job, _ctx = {}) {
  return {
    project_name:   job.address || "—",
    client_name:    job.client_name || "—",
    handover_date:  fmtDate(new Date().toISOString()),
    company_name:   "Manning and Morris Pty Ltd trading as Blue Leaf Building",
  };
}

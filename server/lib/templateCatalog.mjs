// templateCatalog.mjs — the canonical list of every template/doc the Hub knows about.
// This code module is the source of truth for WHAT templates exist; the `document_templates`
// DB table stores editable metadata + Dropbox sync/health state + any admin-added rows, merged
// over this list by `key`. Keeping the base list in code means the registry page shows everything
// on day one (with truthful edit-methods) without a seed step.
//
// kind:    docx_template | pdf_generator | email_md | whs_markdown | reference_doc
// status:  active (built/in use) | planned (required, not built) | draft | archived
// editMethod is the staff-facing "how do I change this": Dropbox master, in-Hub editor,
// app-generated (layout in code), or edit-in-code.

// Per-software-module folders (Sam's choice) under ADMINISTRATION/TEMPLATES.
export const TEMPLATE_MODULES = {
  sales:      { label: "Sales",                 folder: "Sales" },
  tender:     { label: "Tender & Procurement",  folder: "Tender & Procurement" },
  operations: { label: "Operations & Site",     folder: "Operations & Site" },
  whs:        { label: "WHS",                    folder: "WHS" },
  finance:    { label: "Finance",               folder: "Finance" },
  contract:   { label: "Contract & Onboarding", folder: "Contract & Onboarding" },
  handover:   { label: "Handover & Warranty",   folder: "Handover & Warranty" },
  marketing:  { label: "Marketing & Referrals", folder: "Marketing & Referrals" },
  admin:      { label: "Admin & Shared",         folder: "Admin & Shared" },
};

// journey order for the optional "client journey" view
export const JOURNEY_ORDER = [
  "Lead & Sales", "Proposal", "Contract & Onboarding", "Procurement",
  "Site & Safety", "Finance", "Handover", "Marketing & Referrals", "Internal",
];

/** @type {Array<{key,module,category,title,kind,status,editMethod,purpose,codeRef?}>} */
export const TEMPLATE_CATALOG = [
  // ── Sales ──────────────────────────────────────────────────────────────────
  { key: "fee-proposal-blb", module: "sales", category: "Proposal", title: "Fee Proposal — Blue Leaf", kind: "docx_template", status: "active",
    editMethod: "Replace the DOCX master in Dropbox (Sales/)", codeRef: "public/BLB_TENDER_TEMPLATE.docx",
    purpose: "The priced scope/quote sent to a client after the discovery meeting. Merge fields fill client, scope, inclusions/exclusions and cost; triggers the acceptance step." },
  { key: "fee-proposal-apb", module: "sales", category: "Proposal", title: "Fee Proposal — Premium (APB-Balanced)", kind: "docx_template", status: "active",
    editMethod: "Replace the DOCX master in Dropbox (Sales/)", codeRef: "public/BLB_APB_TEMPLATE.docx",
    purpose: "Premium-layout variant of the fee proposal (testimonials, value framing). Same merge data, richer presentation." },
  { key: "ptsa-agreement", module: "sales", category: "Proposal", title: "PTSA — Pre-Tender Services Agreement", kind: "docx_template", status: "active",
    editMethod: "Edit in Dropbox once extracted (currently hardcoded in code — see Workstream C#3)", codeRef: "server/lib/salesRoutes.mjs (PTSA_TEMPLATE_B64)",
    purpose: "Formalises a paid pre-tender site analysis: scope + fee; the client's signature authorises the work to begin." },
  { key: "fee-proposal-email", module: "sales", category: "Proposal", title: "Fee-proposal covering email", kind: "email_md", status: "active",
    editMethod: "Edit in Hub (writes the .md master to Dropbox)", codeRef: "server/lib/module5Routes.mjs",
    purpose: "The email that delivers the fee proposal PDF to the client." },
  { key: "ptsa-email", module: "sales", category: "Proposal", title: "PTSA covering email", kind: "email_md", status: "planned",
    editMethod: "Edit in Hub (writes the .md master to Dropbox)",
    purpose: "Covering email when sending the PTSA for signature." },
  { key: "discovery-questionnaire", module: "sales", category: "Lead & Sales", title: "Discovery questionnaire", kind: "reference_doc", status: "planned",
    editMethod: "Edit in Hub / Dropbox",
    purpose: "One email + embedded form sent before discovery to gather brief, budget and site facts up front." },

  // ── Tender & Procurement ─────────────────────────────────────────────────────
  { key: "subbie-compliance-email", module: "tender", category: "Procurement", title: "Subbie onboarding + compliance email", kind: "email_md", status: "planned",
    editMethod: "Edit in Hub (writes the .md master to Dropbox)",
    purpose: "Requests a subcontractor's insurances, licences and bank details, and chases 30-day renewals." },
  { key: "po-pdf", module: "tender", category: "Procurement", title: "Purchase Order", kind: "pdf_generator", status: "active",
    editMethod: "App-generated (layout in code)", codeRef: "server/lib/poPdfKit.mjs",
    purpose: "The PO issued to a trade; filed to the job's Dropbox and emailed. Layout is generated from job + line data." },
  { key: "rfq-package", module: "tender", category: "Procurement", title: "RFQ package", kind: "pdf_generator", status: "active",
    editMethod: "App-generated (layout in code)", codeRef: "server/lib/rfqPackageRoutes.mjs",
    purpose: "The request-for-quote pack sent to subbies during tendering." },
  { key: "quote-comparison", module: "tender", category: "Procurement", title: "Quote comparison / leveling", kind: "reference_doc", status: "planned",
    editMethod: "In-app view + export",
    purpose: "Side-by-side subbie quote leveling so the cheapest compliant quote is chosen on a like-for-like basis." },

  // ── Operations & Site ────────────────────────────────────────────────────────
  { key: "base-site-task-checklist", module: "operations", category: "Site & Safety", title: "Base site-task checklist (per stage)", kind: "reference_doc", status: "active",
    editMethod: "Move to Dropbox master so it's editable offline (Workstream D3)", codeRef: "server/lib/carpentryRoutes.mjs (SITE_TASK_STAGES)",
    purpose: "The default per-stage task list a new carpentry job opens with, for the leading hand to tick off." },
  { key: "supervisor-qc-checklist", module: "operations", category: "Site & Safety", title: "Supervisor QC checklist", kind: "reference_doc", status: "planned",
    editMethod: "Dropbox master (editable offline)",
    purpose: "The supervisor's quality-control checks per stage (e.g. order flashings, check tie-downs), shown as 'tasks for supervisors'." },
  { key: "site-diary-pdf", module: "operations", category: "Site & Safety", title: "Site Diary export", kind: "pdf_generator", status: "active",
    editMethod: "App-generated (layout in code)", codeRef: "server/lib/module6PdfKit.mjs",
    purpose: "PDF export of a project's site diary entries." },

  // ── WHS ───────────────────────────────────────────────────────────────────────
  { key: "whs-management-plan", module: "whs", category: "Site & Safety", title: "WHS Management Plan", kind: "whs_markdown", status: "active",
    editMethod: "Edit the markdown master in Dropbox (merge fields via whsMergeFields)", codeRef: "docs/whs/template-pack/03_project_whs_management_plan.md",
    purpose: "Project hazards, controls and WHS roles. Generated per job; needs the generate/approve/download UI (Workstream C#11)." },
  { key: "emergency-management-plan", module: "whs", category: "Site & Safety", title: "Emergency Management Plan", kind: "whs_markdown", status: "active",
    editMethod: "Edit the markdown master in Dropbox", codeRef: "docs/whs/template-pack/04_emergency_management_plan.md",
    purpose: "Site emergency procedures + contacts." },
  { key: "site-safety-plan", module: "whs", category: "Site & Safety", title: "Site Safety Plan", kind: "whs_markdown", status: "active",
    editMethod: "Edit the markdown master in Dropbox", codeRef: "docs/whs/template-pack/05_site_safety_plan.md",
    purpose: "Site-specific safety plan." },
  { key: "swms-pack", module: "whs", category: "Site & Safety", title: "SWMS (per trade — 10)", kind: "whs_markdown", status: "active",
    editMethod: "Edit the markdown masters in Dropbox (WHS/SWMS/)", codeRef: "docs/whs/template-pack/swms/",
    purpose: "Safe Work Method Statements per high-risk activity." },
  { key: "permits", module: "whs", category: "Site & Safety", title: "Permits (hot work · excavation · heights)", kind: "whs_markdown", status: "active",
    editMethod: "Edit the markdown masters in Dropbox (WHS/Permits/)", codeRef: "docs/whs/template-pack/permits/",
    purpose: "High-risk-work permits." },
  { key: "incident-report-pdf", module: "whs", category: "Site & Safety", title: "Incident Report", kind: "pdf_generator", status: "active",
    editMethod: "App-generated (layout in code)", codeRef: "server/lib/module6PdfKit.mjs",
    purpose: "WHS incident report PDF, filed to the job's Dropbox." },
  { key: "induction-pdf", module: "whs", category: "Site & Safety", title: "Site Induction", kind: "pdf_generator", status: "active",
    editMethod: "App-generated (layout in code)", codeRef: "server/lib/module6PdfKit.mjs",
    purpose: "Completed site-induction record from the public induction form." },
  { key: "mandatory-inspections", module: "whs", category: "Site & Safety", title: "Mandatory inspections checklist", kind: "reference_doc", status: "planned",
    editMethod: "In-app record + Dropbox master",
    purpose: "Frame / waterproofing / final certifier inspections — booked / passed / certificate stored." },
  { key: "insurance-register", module: "whs", category: "Site & Safety", title: "Insurance register", kind: "reference_doc", status: "planned",
    editMethod: "In-app per-job record",
    purpose: "Builders-warranty + works/public-liability certificates with expiry tracking + reminders." },

  // ── Finance ─────────────────────────────────────────────────────────────────
  { key: "progress-claim-email", module: "finance", category: "Finance", title: "Progress Claim email", kind: "email_md", status: "active",
    editMethod: "Edit in Hub (writes the .md master to Dropbox)", codeRef: "server/lib/emailTemplates/financeEmails.mjs",
    purpose: "Notifies the client a progress claim is due (amount, GST, due date, bank details)." },
  { key: "variation-email", module: "finance", category: "Finance", title: "Variation email", kind: "email_md", status: "active",
    editMethod: "Edit in Hub (writes the .md master to Dropbox)", codeRef: "server/lib/emailTemplates/financeEmails.mjs",
    purpose: "Sends a variation to the client for review/sign-off (incl. EOT days if any)." },
  { key: "progress-claim-pdf", module: "finance", category: "Finance", title: "Progress Claim PDF", kind: "pdf_generator", status: "active",
    editMethod: "App-generated (layout in code)", codeRef: "server/lib/financeCCRoutes.mjs",
    purpose: "The formal progress-claim document attached to the claim email." },
  { key: "variation-pdf", module: "finance", category: "Finance", title: "Variation PDF", kind: "pdf_generator", status: "active",
    editMethod: "App-generated (layout in code)", codeRef: "server/lib/financeCCRoutes.mjs",
    purpose: "The formal variation document attached to the variation email." },
  { key: "sopa-overdue-notice", module: "finance", category: "Finance", title: "SOPA Overdue Notice", kind: "docx_template", status: "planned",
    editMethod: "Dropbox master (legal sign-off before live use)",
    purpose: "Security-of-Payment overdue notice — the legal escalation when a claim is unpaid." },
  { key: "payment-reminder-email", module: "finance", category: "Finance", title: "Payment reminder email", kind: "email_md", status: "planned",
    editMethod: "Edit in Hub (writes the .md master to Dropbox)",
    purpose: "Friendly reminder before the SOPA notice — first rung of the payment-collection ladder." },
  { key: "payment-receipt-email", module: "finance", category: "Finance", title: "Payment receipt email", kind: "email_md", status: "planned",
    editMethod: "Edit in Hub (writes the .md master to Dropbox)",
    purpose: "Confirms a received payment and updates the claim status." },

  // ── Contract & Onboarding ─────────────────────────────────────────────────────
  { key: "small-works-contract", module: "contract", category: "Contract & Onboarding", title: "Small-works Building Contract", kind: "docx_template", status: "planned",
    editMethod: "Dropbox master (legal sign-off before live use)",
    purpose: "Generated contract for smaller jobs; the major-job path records/cover-sheets the external HIA/MBA contract." },
  { key: "contract-cover-sheet", module: "contract", category: "Contract & Onboarding", title: "Contract Cover Sheet", kind: "docx_template", status: "planned",
    editMethod: "Dropbox master",
    purpose: "One-page cover recording the contract value + signed date for the job file." },
  { key: "onboarding-pack", module: "contract", category: "Contract & Onboarding", title: "Client Onboarding Pack (Handbook)", kind: "docx_template", status: "planned",
    editMethod: "Dropbox master (needs Sam's content)",
    purpose: "The 'what to expect' handbook a client receives at contract — the biggest genuine whitespace." },
  { key: "onboarding-welcome-email", module: "contract", category: "Contract & Onboarding", title: "Onboarding welcome email", kind: "email_md", status: "planned",
    editMethod: "Edit in Hub (writes the .md master to Dropbox)",
    purpose: "Welcomes the client and folds in their portal invite link." },

  // ── Handover & Warranty ───────────────────────────────────────────────────────
  { key: "handover-pack", module: "handover", category: "Handover", title: "PC Notice + Handover Pack", kind: "docx_template", status: "planned",
    editMethod: "Dropbox master (needs Sam's content)",
    purpose: "One pack at practical completion: PC notice + warranty + certificates index + finishes register + handover checklist." },
  { key: "warranty-statement", module: "handover", category: "Handover", title: "Builder's Warranty Statement", kind: "docx_template", status: "planned",
    editMethod: "Dropbox master",
    purpose: "The builder's warranty terms handed over at completion." },
  { key: "post-handover-followup-email", module: "handover", category: "Handover", title: "Post-handover follow-up + review email", kind: "email_md", status: "planned",
    editMethod: "Edit in Hub (writes the .md master to Dropbox)",
    purpose: "Follow-up after handover asking for a review/referral." },

  // ── Marketing & Referrals ─────────────────────────────────────────────────────
  { key: "evergreen-maintenance-guide", module: "marketing", category: "Marketing & Referrals", title: "Evergreen Maintenance Guide", kind: "reference_doc", status: "planned",
    editMethod: "Dropbox master (PDF)",
    purpose: "A single evergreen home-maintenance guide given to every client (replaces per-job guides)." },
  { key: "photo-consent-form", module: "marketing", category: "Marketing & Referrals", title: "Client photo/content consent form", kind: "reference_doc", status: "planned",
    editMethod: "Signed form / portal consent action",
    purpose: "Captures the client's consent to use photos/content for marketing (feeds marketing_media.consent_for_marketing)." },

  // ── Admin & Shared ─────────────────────────────────────────────────────────────
  { key: "email-shell", module: "admin", category: "Internal", title: "Branded email shell", kind: "reference_doc", status: "active",
    editMethod: "Edit in code", codeRef: "server/lib/emailTemplates/layout.mjs",
    purpose: "The shared Blue Leaf-branded HTML wrapper every system email renders inside." },
  { key: "user-invite-email", module: "admin", category: "Internal", title: "Staff invite email", kind: "email_md", status: "active",
    editMethod: "Edit in code (move to .md master — future)", codeRef: "server/lib/authRoutes.mjs",
    purpose: "The email that invites a new staff member to set up their Hub account." },
];

/** Merge the code catalogue with DB override rows (keyed by catalog_key/key). DB wins per-field. */
export function mergeCatalogWithRows(rows = []) {
  const byKey = new Map();
  for (const t of TEMPLATE_CATALOG) byKey.set(t.key, { ...t, source: "catalog" });
  for (const r of rows) {
    const key = r.catalog_key || r.catalogKey;
    const base = (key && byKey.get(key)) || {};
    byKey.set(key || r.id, {
      ...base,
      ...Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null && v !== undefined)),
      key: key || base.key || r.id,
      id: r.id,
      source: key && base.title ? "catalog+db" : "db",
    });
  }
  return [...byKey.values()];
}

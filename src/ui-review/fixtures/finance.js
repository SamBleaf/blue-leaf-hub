/** UI Review fixtures — Finance manager + job command centre (review-only). */
import { route } from "../registry.js";

const JOBS = [
  { id: "job-1001", reference: "J1171", address: "5A Gibson Street, Marino SA", client_name: "Denberger Built", contract_value: 845000, original_contract_value: 820000, progress_billed: 355000, forecast_total_cost: 690000, estimated_total_cost: 668000, target_margin_pct: 18.5, status: "active" },
  { id: "job-1002", reference: "J1120", address: "24 Naldera Cres, Glenelg SA", client_name: "Harper Reno", contract_value: 512000, original_contract_value: 512000, progress_billed: 389000, forecast_total_cost: 405000, estimated_total_cost: 398000, target_margin_pct: 21.0, status: "active" },
];
route("GET", "/api/finance/jobs", () => ({ ok: true, jobs: JOBS }));
route("GET", "/api/finance/portfolio", () => ({ ok: true, jobs: JOBS, totals: { contract: 1357000, billed: 744000, forecastCost: 1095000, forecastMarginPct: 19.3 } }));
route("GET", "/api/finance/jobs/:id", ({ params }) => ({ ok: true, job: JOBS.find((j) => j.id === params.id) || JOBS[0] }));
route("GET", "/api/finance/jobs/:id/claims", () => ({ ok: true, claims: [
  { id: "pc-1", stage: "deposit", amount: 84500, status: "paid", invoiced_at: "2026-03-05", due_date: "2026-03-19" },
  { id: "pc-2", stage: "slab", amount: 126750, status: "paid", invoiced_at: "2026-04-02", due_date: "2026-04-16" },
  { id: "pc-3", stage: "frame", amount: 143650, status: "issued", invoiced_at: "2026-06-18", due_date: "2026-07-02" },
] }));
route("GET", "/api/finance/jobs/:id/variations", () => ({ ok: true, variations: [
  { id: "v1", number: "VO-01", description: "Upgrade to stone benchtops", amount: 12500, status: "approved" },
  { id: "v2", number: "VO-02", description: "Additional rear window", amount: 3200, status: "pending" },
] }));
route("GET", "/api/finance/invoices", () => ({ ok: true, invoices: [
  { id: "inv-1", vendor: "SA Concreting", job_reference: "J1171", amount: 41200, status: "approved", received_at: "2026-06-15" },
  { id: "inv-2", vendor: "Volt Electrical", job_reference: "J1120", amount: 36500, status: "pending", received_at: "2026-06-19" },
] }));
route("GET", "/api/finance/inbox", () => ({ ok: true, invoices: [
  { id: "inb-1", vendor: "Apex Roofing", amount: 28800, status: "unmatched", received_at: "2026-06-21", subject: "Invoice 8841" },
] }));

// FinanceManager (FinancialInbox tab) + dashboard stats
route("GET", "/api/finance/stats", () => ({ ok: true, counts: { unmatched: 1, pending_approval: 2, filed: 11 }, totalApprovedValue: 312000 }));
route("GET", "/api/finance/xero/status", () => ({ ok: true, connected: false, status: "not_connected" }));
route("GET", "/api/finance/documents", () => ({ ok: true, documents: [
  { id: "fd-1", vendor: "SA Concreting", supplier: "SA Concreting", amount: 41200, total: 41200, status: "pending", job_id: "job-1001", filename: "sa-concreting-inv-3312.pdf", received_at: "2026-06-15", notes: "", carpentry_job_id: null, carpentry_cost_category: null, line_items: [] },
  { id: "fd-2", vendor: "Volt Electrical", supplier: "Volt Electrical", amount: 36500, total: 36500, status: "approved", job_id: "job-1002", filename: "volt-elec-8841.pdf", received_at: "2026-06-19", notes: "", carpentry_job_id: null, carpentry_cost_category: null, line_items: [] },
] }));
route("GET", "/api/finance/carpentry-jobs", () => ({ ok: true, carpentryJobs: [{ id: "cjb-1", reference: "J1171", address: "5A Gibson Street, Marino SA" }], jobs: [{ id: "cjb-1", reference: "J1171", address: "5A Gibson Street, Marino SA" }] }));
route("GET", "/api/finance/carpentry-jobs/:id/material-categories", () => ({ ok: true, categories: [{ id: "mc-1", name: "Timber & framing" }, { id: "mc-2", name: "Fixings" }] }));

// Job command centre (/finance/jobs/:id) — JobCommandCentre reads summary.job + summary.kpis
route("GET", "/api/finance/jobs/:jobId/command-centre", ({ params }) => ({
  ok: true,
  job: { id: params.jobId, reference: "J1171", address: "5A Gibson Street, Marino SA", client_name: "Denberger Built", status: "active",
         contract_value: 845000, original_contract_value: 820000, progress_billed: 355000, forecast_total_cost: 690000, estimated_total_cost: 668000,
         target_margin_pct: 18.5, floor_margin_pct: 12.0 },
  kpis: {
    contract_value: 845000, forecast_cost: 690000, forecast_margin_pct: 18.3, working_margin_pct: 18.3,
    billed_to_date: 355000, cost_to_date: 312000, claims_issued: 355000, claims_paid: 211250,
    actual_costs: 312000, committed_cost: 173600, retention: 0,
  },
  variations: { signed_total: 12500, sent_total: 3200 },
  budget_vs_actual: [
    { trade_category_id: "tc-1", category: "Carpentry", budget_amount: 184000, actual_amount: 61200, forecast_amount: 132400 },
    { trade_category_id: "tc-2", category: "Concrete", budget_amount: 96000, actual_amount: 41200, forecast_amount: 41200 },
  ],
  claims: [
    { id: "pc-3", stage: "frame", amount: 143650, status: "issued", due_date: "2026-07-02" },
  ],
}));
route("GET", "/api/finance/jobs/:jobId/cashflow", () => ({ ok: true, cashflow: { rows: [] }, rows: [] }));
route("GET", "/api/crm/jobs/:jobId/contact-roles", () => ({ ok: true, roles: [] }));

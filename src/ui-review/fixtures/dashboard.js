/** UI Review fixtures — admin/director dashboard (Home.jsx) (review-only). */
import { route } from "../registry.js";

const JOBS = [
  { id: "job-1001", reference: "J1171", address: "5A Gibson Street, Marino SA", client_name: "Denberger Built", status: "active", stage: "frame", contract_value: 845000, progress_pct: 42, margin_pct: 18.5 },
  { id: "job-1002", reference: "J1120", address: "24 Naldera Cres, Glenelg SA", client_name: "Harper Reno", status: "active", stage: "fitout", contract_value: 512000, progress_pct: 76, margin_pct: 21.0 },
  { id: "job-1003", reference: "J1185", address: "2 Forrest Ave, Marino SA", client_name: "Forrest Extension", status: "tendering", stage: "pre_construction", contract_value: 690000, progress_pct: 0, margin_pct: 17.0 },
];

// Director portfolio / dashboard summary (shapes are tolerant — view reads what it needs).
route("GET", "/api/dashboard/summary", () => ({
  ok: true,
  summary: {
    activeJobs: 6, tendering: 3, wonThisMonth: 2, pipelineValue: 4150000,
    revenueYtd: 3260000, avgMargin: 19.4, overdueTasks: 4, openRfqs: 11,
  },
  jobs: JOBS,
}));
route("GET", "/api/finance/portfolio", () => ({ ok: true, jobs: JOBS, totals: { contract: 2047000, billed: 1180000, cost: 1610000, forecastMargin: 19.4 } }));
route("GET", "/api/jobs", () => ({ ok: true, jobs: JOBS }));
route("GET", "/api/operations/dashboard", () => ({ ok: true, jobs: JOBS }));

// Home.jsx dashboard tiles (sales scorecard + unmatched invoice badge).
route("GET", "/api/sales/scorecard", () => ({
  ok: true,
  scorecard: { pipeline_value: 4150000, active_leads: 8, weighted_forecast: 1980000, won_12m: 14, won_value_12m: 8200000, fee_proposal_hit_rate: 0.62, avg_margin: 19.4 },
  pipeline_value: 4150000, active_leads: 8, weighted_forecast: 1980000, won_12m: 14, fee_proposal_hit_rate: 0.62,
}));
route("GET", "/api/finance/documents/unmatched-count", () => ({ ok: true, count: 1, unmatched: 1 }));

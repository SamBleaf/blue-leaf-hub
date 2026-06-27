/** UI Review fixtures — Operations list + project command centre (review-only). */
import { route } from "../registry.js";

const PROJECTS = [
  { id: "proj-1", address: "5A Gibson Street, Marino SA", client_name: "Denberger Built", status: "active", stage: "frame", progress_pct: 42, next_milestone: "Frame inspection", active_trades: 3, health: "on_track", start_date: "2026-03-01", end_date: "2026-11-20" },
  { id: "proj-2", address: "24 Naldera Cres, Glenelg SA", client_name: "Harper Reno", status: "active", stage: "fitout", progress_pct: 76, next_milestone: "Cabinetry install", active_trades: 4, health: "at_risk", start_date: "2026-01-15", end_date: "2026-08-30" },
  { id: "proj-3", address: "11 Cliff St, Seacliff SA", client_name: "Okello Build", status: "active", stage: "lock_up", progress_pct: 58, next_milestone: "Waterproofing", active_trades: 2, health: "on_track", start_date: "2026-02-10", end_date: "2026-10-05" },
];
route("GET", "/api/operations/projects", () => ({ ok: true, projects: PROJECTS }));
route("GET", "/api/projects", () => ({ ok: true, projects: PROJECTS }));
route("GET", "/api/operations/:projectId", ({ params }) => ({ ok: true, project: PROJECTS.find((p) => p.id === params.projectId) || PROJECTS[0] }));
route("GET", "/api/projects/:id", ({ params }) => ({ ok: true, project: PROJECTS.find((p) => p.id === params.id) || PROJECTS[0] }));

// Command-centre tabs
route("GET", "/api/operations/:projectId/summary", () => ({ ok: true, summary: { progress_pct: 42, days_remaining: 96, budget_used_pct: 38, open_tasks: 7, overdue_tasks: 1, active_trades: 3, next_milestone: "Frame inspection", next_milestone_date: "2026-07-08" } }));
route("GET", "/api/projects/:id/site-tasks", () => ({ ok: true, tasks: [
  { id: "t1", title: "Confirm truss delivery date", priority: "urgent", status: "open", category: "materials" },
  { id: "t2", title: "Book frame inspection", priority: "normal", status: "in_progress", category: "inspection" },
  { id: "t3", title: "Site clean before plaster", priority: "when_time_permits", status: "open", category: "general" },
] }));
route("GET", "/api/diary/:projectId", () => ({ ok: true, entries: [
  { id: "diary-1", date: "2026-06-20", weather: "Fine 18°C", note: "Frame 80% complete, roof trusses craned in.", author: "Sam Supervisor", photos: 3 },
  { id: "diary-2", date: "2026-06-19", weather: "Showers", note: "Rain delay AM; resumed framing PM.", author: "Sam Supervisor", photos: 1 },
] }));
route("GET", "/api/carpentry/jobs", () => ({ ok: true, jobs: [
  { id: "cjb-1", reference: "J1171", address: "5A Gibson Street, Marino SA", client_name: "Denberger Built", status: "active", buildexact_job_id: "bx-eca075ee", contract_value: 184000, labour_actual: 61200, budget: 96000 },
] }));
route("GET", "/api/carpentry/jobs/:id", ({ params }) => ({ ok: true, job: { id: params.id, reference: "J1171", address: "5A Gibson Street, Marino SA", client_name: "Denberger Built", status: "active", quotedValue: 184000, quotedCost: 150000, quotedMarginPct: 18.5 } }));
route("GET", "/api/carpentry/jobs/:id/tasks", () => ({ ok: true, tasks: [{ id: "ct1", title: "First fix framing", status: "in_progress", category: "general" }] }));

// OperationsProjectDetail sub-endpoints (arrays MUST be present — components .filter/.map them).
route("GET", "/api/projects/:projectId/ops-readiness", () => ({ ok: true, ready: true, items: [], checklist: [], score: 100 }));
route("GET", "/api/projects/:projectId/trades", () => ({ ok: true, trades: [], commencement_date: "2026-03-01", phases: [], summary: {} }));
route("GET", "/api/projects/:projectId/supervisor-tasks", () => ({ ok: true, tasks: [] }));
route("GET", "/api/projects/:projectId/labour", () => ({ ok: true, entries: [], total_hours: 0, total_cost: 0 }));
route("GET", "/api/whs/:projectId/compliance", () => ({ ok: true, subcontractors: [] }));
route("GET", "/api/whs/:projectId/reports", () => ({ ok: true, reports: [] }));

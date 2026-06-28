/** UI Review fixtures — Operations list + project command centre (review-only).
 * Shapes mirror the REAL endpoints in server/lib/operationsRoutes.mjs:
 *   /api/operations/projects      → { ok, projects:[{ ...projectRow, jobs:{won_at}, schedule:{total,done,overdue,overall,nextMilestone,activeTrades,health} }] }
 *   /api/operations/global-tasks  → { ok, projects:[{id,address}], tasks:[{id,project_id,name,phase,start_date,end_date,percent_complete,task_type,is_hold_point,assignee_trade,trade}] }
 *   /api/operations/trade-conflicts → { ok, conflicts:[{ trade, projects:[{id,address,startDate,endDate}] }] }
 * health is "green" | "amber" | "red" (overdue >=4 red, >=1 amber, else green).
 */
import { route } from "../registry.js";

// Multiple projects across health states + an empty-schedule case.
const PROJECTS = [
  { id: "proj-1", address: "5A Gibson Street, Marino SA", job_id: "job-1001", status: "active", tentative_start_date: "2026-04-15", accepted_trades: ["Carpenter", "Plumber"], buildexact_job_id: "bx-eca075ee", buildexact_link_source: "auto", created_at: "2026-04-02T03:00:00Z", schedule_baseline_locked_at: "2026-04-10T00:00:00Z",
    jobs: { id: "job-1001", won_at: "2026-04-02" },
    schedule: { total: 24, done: 10, overdue: 2, overall: 42, nextMilestone: { id: "t-fi", name: "Frame inspection", start_date: "2026-07-02" }, activeTrades: ["Carpenter", "Plumber"], health: "amber" } },
  { id: "proj-2", address: "24 Naldera Cres, Glenelg SA", job_id: "job-1002", status: "active", tentative_start_date: "2026-02-01", accepted_trades: ["Tiler", "Painter", "Cabinetmaker"], buildexact_job_id: "bx-2240ab", buildexact_link_source: "auto", created_at: "2026-01-20T03:00:00Z", schedule_baseline_locked_at: "2026-02-01T00:00:00Z",
    jobs: { id: "job-1002", won_at: "2026-01-20" },
    schedule: { total: 40, done: 30, overdue: 0, overall: 76, nextMilestone: { id: "t-pc", name: "PC inspection", start_date: "2026-07-18" }, activeTrades: ["Tiler", "Painter", "Cabinetmaker"], health: "green" } },
  { id: "proj-3", address: "11 Cliff St, Seacliff SA", job_id: "job-1003", status: "active", tentative_start_date: "2026-07-01", accepted_trades: ["Excavator"], buildexact_job_id: null, buildexact_link_source: null, created_at: "2026-06-10T03:00:00Z", schedule_baseline_locked_at: null,
    jobs: { id: "job-1003", won_at: "2026-06-10" },
    schedule: { total: 18, done: 1, overdue: 5, overall: 8, nextMilestone: { id: "t-ca", name: "Council approval", start_date: "2026-06-15" }, activeTrades: ["Excavator"], health: "red" } },
  { id: "proj-4", address: "14 Hewitt Ave, Burnside SA", job_id: "job-1004", status: "active", tentative_start_date: "2026-03-20", accepted_trades: ["Roof Plumber", "Carpenter"], buildexact_job_id: "bx-14hew", buildexact_link_source: "manual", created_at: "2026-03-05T03:00:00Z", schedule_baseline_locked_at: "2026-03-15T00:00:00Z",
    jobs: { id: "job-1004", won_at: "2026-03-05" },
    schedule: { total: 30, done: 17, overdue: 0, overall: 58, nextMilestone: { id: "t-rh", name: "Roof handover", start_date: "2026-07-08" }, activeTrades: ["Roof Plumber", "Carpenter"], health: "green" } },
  { id: "proj-5", address: "9 Beulah Rd, Norwood SA", job_id: "job-1005", status: "active", tentative_start_date: "2026-02-25", accepted_trades: ["Carpenter", "Electrician", "Plumber", "Glazier"], buildexact_job_id: "bx-9beu", buildexact_link_source: "auto", created_at: "2026-02-12T03:00:00Z", schedule_baseline_locked_at: "2026-02-20T00:00:00Z",
    jobs: { id: "job-1005", won_at: "2026-02-12" },
    schedule: { total: 28, done: 18, overdue: 1, overall: 64, nextMilestone: { id: "t-lu", name: "Lock-up complete", start_date: "2026-07-10" }, activeTrades: ["Carpenter", "Electrician", "Plumber", "Glazier"], health: "amber" } },
  { id: "proj-6", address: "2 Forrest Ave, Marino SA", job_id: "job-1006", status: "active", tentative_start_date: "2026-07-15", accepted_trades: [], buildexact_job_id: null, buildexact_link_source: null, created_at: "2026-06-25T03:00:00Z", schedule_baseline_locked_at: null,
    jobs: { id: "job-1006", won_at: "2026-06-25" },
    schedule: { total: 0, done: 0, overdue: 0, overall: 0, nextMilestone: null, activeTrades: [], health: "green" } },
];

// Exact /api/operations/* routes FIRST — registry is first-match-wins, so these must be
// registered before the /api/operations/:projectId wildcard (else the wildcard shadows them).
route("GET", "/api/operations/projects", () => ({ ok: true, projects: PROJECTS }));
route("GET", "/api/projects", () => ({ ok: true, projects: PROJECTS }));

// Global Gantt — cross-project tasks (overdue / upcoming / milestone / procurement ripple-risk).
const GLOBAL_TASKS = [
  // proj-1 — overdue framing + overdue procurement (ripple) + upcoming milestone
  { id: "gt-1", project_id: "proj-1", name: "Wall frames", phase: "frame", start_date: "2026-06-08", end_date: "2026-06-27", percent_complete: 90, task_type: "task", is_hold_point: false, assignee_trade: "Carpenter", trade: "Carpenter" },
  { id: "gt-2", project_id: "proj-1", name: "Roof trusses (order)", phase: "roofing", start_date: "2026-06-20", end_date: "2026-06-26", percent_complete: 0, task_type: "procurement", is_hold_point: false, assignee_trade: "Roof Plumber", trade: "Roof Plumber" },
  { id: "gt-3", project_id: "proj-1", name: "Frame inspection", phase: "frame", start_date: "2026-07-02", end_date: "2026-07-02", percent_complete: 0, task_type: "milestone", is_hold_point: true, assignee_trade: null, trade: null },
  // proj-3 — overdue council approval (behind)
  { id: "gt-4", project_id: "proj-3", name: "Council approval", phase: "pre_construction", start_date: "2026-06-15", end_date: "2026-06-15", percent_complete: 0, task_type: "milestone", is_hold_point: true, assignee_trade: null, trade: null },
  { id: "gt-5", project_id: "proj-3", name: "Site establishment", phase: "site_prep", start_date: "2026-07-01", end_date: "2026-07-04", percent_complete: 0, task_type: "task", is_hold_point: false, assignee_trade: "Excavator", trade: "Excavator" },
  // proj-5 — Carpenter on overlapping dates with proj-1 (trade conflict) + upcoming lock-up
  { id: "gt-6", project_id: "proj-5", name: "Internal fix-out", phase: "lock_up", start_date: "2026-06-22", end_date: "2026-07-10", percent_complete: 40, task_type: "task", is_hold_point: false, assignee_trade: "Carpenter", trade: "Carpenter" },
  // proj-4 — upcoming roof cladding
  { id: "gt-7", project_id: "proj-4", name: "Roof cladding", phase: "roofing", start_date: "2026-06-25", end_date: "2026-07-05", percent_complete: 30, task_type: "task", is_hold_point: false, assignee_trade: "Roof Plumber", trade: "Roof Plumber" },
  // proj-2 — upcoming cabinetry + PC milestone
  { id: "gt-8", project_id: "proj-2", name: "Cabinetry install", phase: "fitout", start_date: "2026-07-05", end_date: "2026-07-20", percent_complete: 0, task_type: "task", is_hold_point: false, assignee_trade: "Cabinetmaker", trade: "Cabinetmaker" },
];
route("GET", "/api/operations/global-tasks", () => ({
  ok: true,
  projects: PROJECTS.map((p) => ({ id: p.id, address: p.address })),
  tasks: GLOBAL_TASKS,
}));

// Trade conflicts — Carpenter double-booked across proj-1 & proj-5 on overlapping dates.
// (Empty/no-conflict state = { ok:true, conflicts:[] } → the page renders no banner.)
route("GET", "/api/operations/trade-conflicts", () => ({
  ok: true,
  conflicts: [
    { trade: "Carpenter", projects: [
      { id: "proj-1", address: "5A Gibson Street, Marino SA", taskName: "Wall frames", startDate: "2026-06-08", endDate: "2026-06-27" },
      { id: "proj-5", address: "9 Beulah Rd, Norwood SA", taskName: "Internal fix-out", startDate: "2026-06-22", endDate: "2026-07-10" },
    ] },
  ],
}));

// Wildcard project lookups — registered AFTER the exact /api/operations/* routes above so
// /api/operations/:projectId does not shadow global-tasks / trade-conflicts (first-match-wins).
route("GET", "/api/operations/:projectId", ({ params }) => ({ ok: true, project: PROJECTS.find((p) => p.id === params.projectId) || PROJECTS[0] }));
route("GET", "/api/projects/:id", ({ params }) => ({ ok: true, project: PROJECTS.find((p) => p.id === params.id) || PROJECTS[0] }));

// ── Direct Supabase reads (Field WHS/Diary + OperationsProjectDetail) ──
// .select() expects an ARRAY; .single() sends Accept: application/vnd.pgrst.object+json → OBJECT.
const PROJECT_DETAIL = {
  id: "proj-1", job_id: "job-1001", address: "5A Gibson Street, Marino SA", status: "active",
  buildexact_job_id: "bx-eca075ee", buildexact_link_source: "auto", buildexact_last_sync: "2026-06-25T22:10:00Z",
  tentative_start_date: "2026-04-15", schedule_baseline_locked_at: "2026-04-10T00:00:00Z",
  portal_token: "tok-proj1", portal_enabled: true,
  dropbox_shared_link: "https://www.dropbox.com/scl/fo/marino-5a",
  accepted_trades: [
    { trade: "Carpenter", subcontractor: "BCJ Framing", quote_amount: 96000 },
    { trade: "Roof Plumber", subcontractor: "Apex Roofing", quote_amount: 41500 },
    { trade: "Electrician", subcontractor: "Voltaic Electrical", quote_amount: 28800 },
  ],
  jobs: { id: "job-1001", address: "5A Gibson Street, Marino SA", won_at: "2026-04-02", dropbox_shared_link: "https://www.dropbox.com/scl/fo/marino-5a", dropbox_link: null, dropbox_internal_path: "/PROJECTS/5A Gibson Street/INTERNAL" },
};
const PROJECT_LIST = [
  { id: "proj-1", address: "5A Gibson Street, Marino SA", created_at: "2026-04-01T00:00:00Z" },
  { id: "proj-2", address: "24 Naldera Cres, Glenelg SA", created_at: "2026-03-15T00:00:00Z" },
  { id: "proj-3", address: "11 Cliff St, Seacliff SA", created_at: "2026-02-20T00:00:00Z" },
];
route("GET", "/rest/v1/projects", ({ opts }) => {
  const accept = String(opts?.headers?.Accept || opts?.headers?.accept || "");
  if (accept.includes("application/vnd.pgrst.object")) return PROJECT_DETAIL;
  return PROJECT_LIST;
});
route("GET", "/rest/v1/purchase_orders", () => ([
  { id: "po-1", project_id: "proj-1", trade: "Carpenter", status: "issued" },
]));

// Site tasks — priorities + task_audience (QC) + voice provenance.
route("GET", "/api/projects/:id/site-tasks", () => ({ ok: true, tasks: [
  { id: "t1", title: "Brace north wall before frame inspection", priority: "urgent", status: "open", category: "safety", task_audience: "site" },
  { id: "t2", title: "Confirm truss delivery slot", priority: "urgent", status: "open", category: "materials", task_audience: "site", created_via: "ai_extraction" },
  { id: "t3", title: "Book frame inspection", priority: "normal", status: "open", category: "inspection", task_audience: "site" },
  { id: "t4", title: "Tidy site for inspection", priority: "normal", status: "open", category: "general", task_audience: "site", employees: { name: "Will Worker" } },
  { id: "t5", title: "Update as-built notes", priority: "when_time_permits", status: "open", category: "general", task_audience: "site" },
  { id: "t6", title: "QC: check wall plumb & straight", priority: "normal", status: "done", category: "inspection", task_audience: "supervisor" },
  { id: "t7", title: "QC: tie-down brackets installed", priority: "normal", status: "open", category: "inspection", task_audience: "supervisor" },
] }));
route("GET", "/api/workforce/employees", () => ({ ok: true, employees: [
  { id: "emp-1", name: "Will Worker" }, { id: "emp-2", name: "Sam Supervisor" },
] }));

// Diary — real shape (entry_date / weather / trades_onsite[] / work_completed).
route("GET", "/api/diary/:projectId", () => ({ ok: true, entries: [
  { id: "diary-1", entry_date: "2026-06-26", weather: "Fine 18°C", trades_onsite: ["Carpenter", "Plumber"], work_completed: "Frame 90% complete; top plate and noggins done. Trusses delivered and set ready for cladding Monday." },
  { id: "diary-2", entry_date: "2026-06-25", weather: "Showers AM", trades_onsite: ["Carpenter"], work_completed: "Rain delay until 10am; resumed wall framing PM. Braced north wall." },
  { id: "diary-3", entry_date: "2026-06-24", weather: "Overcast 16°C", trades_onsite: ["Carpenter", "Electrician"], work_completed: "Wall frames stood; rough-in pre-wire started in wet areas." },
] }));
route("GET", "/api/carpentry/jobs", () => ({ ok: true, jobs: [
  { id: "cjb-1", reference: "J1171", address: "5A Gibson Street, Marino SA", client_name: "Denberger Built", status: "active", buildexact_job_id: "bx-eca075ee", contract_value: 184000, labour_actual: 61200, budget: 96000 },
] }));
route("GET", "/api/carpentry/jobs/:id", ({ params }) => ({ ok: true, job: { id: params.id, reference: "J1171", address: "5A Gibson Street, Marino SA", client_name: "Denberger Built", status: "active", quotedValue: 184000, quotedCost: 150000, quotedMarginPct: 18.5 } }));
route("GET", "/api/carpentry/jobs/:id/tasks", () => ({ ok: true, tasks: [{ id: "ct1", title: "First fix framing", status: "in_progress", category: "general" }] }));

// Ops readiness — overallReady true so the setup banner stays hidden (clean command centre).
route("GET", "/api/projects/:projectId/ops-readiness", () => ({ ok: true, overallReady: true, readyCount: 6, missingCount: 0, warningCount: 0, items: [] }));

// Trades — accepted trades with PO/comms state incl. one ghosting (drives Supervisor Actions).
route("GET", "/api/projects/:projectId/trades", () => ({ ok: true, commencement_date: "2026-04-15", phases: [], summary: {}, trades: [
  { id: "po-1", trade: "Carpenter", subcontractor: { business_name: "BCJ Framing", phone: "0400 111 222" }, po_number: "BLB-1042", last_contact_at: "2026-06-24T00:00:00Z", days_since_contact: 4, response_received_at: "2026-06-24T00:00:00Z", is_ghosting: false, status_label: "Responded", log: [{ id: "ev1", sent_at: "2026-06-20T00:00:00Z", event_type: "po_issued", email_subject: "PO BLB-1042 — Carpenter" }], supervisor_tasks: [] },
  { id: "po-2", trade: "Roof Plumber", subcontractor: { business_name: "Apex Roofing", phone: "0400 333 444" }, po_number: "BLB-1043", last_contact_at: "2026-06-21T00:00:00Z", days_since_contact: 7, response_received_at: null, is_ghosting: true, status_label: "Awaiting response", log: [{ id: "ev2", sent_at: "2026-06-21T00:00:00Z", event_type: "po_issued", email_subject: "PO BLB-1043 — Roof Plumber" }], supervisor_tasks: [{ id: "sup-1", task_type: "call_trade_no_response", title: "Call Apex Roofing — no response in 7 days", due_date: "2026-06-27" }] },
  { id: "po-3", trade: "Electrician", subcontractor: { business_name: "Voltaic Electrical", phone: "0400 555 666" }, po_number: "BLB-1044", last_contact_at: "2026-06-25T00:00:00Z", days_since_contact: 3, response_received_at: null, is_ghosting: false, status_label: "PO issued", log: [], supervisor_tasks: [] },
] }));
route("GET", "/api/projects/:projectId/supervisor-tasks", () => ({ ok: true, tasks: [
  { id: "sup-1", task_type: "call_trade_no_response", title: "Call Apex Roofing — no response in 7 days", description: "Roof trusses need confirming before cladding starts.", due_date: "2026-06-27", subcontractors: { phone: "0400 333 444" } },
  { id: "sup-2", task_type: "find_backup_trade", title: "Line up backup roof plumber", description: "In case Apex can't commit this week.", due_date: "2026-06-30", subcontractors: {} },
] }));
// Labour — real shape (entries_by_category[] + total_hours + workers_this_week[]).
route("GET", "/api/projects/:projectId/labour", () => ({ ok: true, total_hours: 412, entries_by_category: [
  { task_category: "framing", label: "Framing", total_hours: 240 },
  { task_category: "general", label: "General labour", total_hours: 96 },
  { task_category: "rough_in", label: "Rough-in", total_hours: 76 },
], workers_this_week: [{ name: "Will Worker" }, { name: "Sam Supervisor" }] }));
// WHS compliance — mixed doc statuses (drives the expiring/expired insight) + one open incident.
route("GET", "/api/whs/:projectId/compliance", () => ({ ok: true, subcontractors: [
  { id: "sub-1", business_name: "BCJ Framing", trade: "Carpenter", documents: [
    { id: "d1", document_type: "public_liability", computed_status: "current", expiry_date: "2027-01-10" },
    { id: "d2", document_type: "swms", computed_status: "expiring_soon", expiry_date: "2026-07-05" },
  ] },
  { id: "sub-2", business_name: "Apex Roofing", trade: "Roof Plumber", documents: [
    { id: "d3", document_type: "workcover", computed_status: "expired", expiry_date: "2026-06-10" },
  ] },
] }));
route("GET", "/api/whs/:projectId/reports", () => ({ ok: true, reports: [
  { id: "rep-1", title: "Near-miss — trip hazard at entry", status: "open", severity: "low", created_at: "2026-06-23T00:00:00Z" },
] }));

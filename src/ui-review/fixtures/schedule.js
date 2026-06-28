/** UI Review fixtures — Schedule manager (Gantt/Sheet/Delays/Dep Map) (review-only). */
import { route } from "../registry.js";

// Additive fields (status / task_type / is_hold_point / order_by_date / assignee_trade) mirror the
// real schedule_tasks columns so OperationsProjectDetail's summary + insights render meaningfully.
const TASKS = [
  { id: "s1", name: "Site establishment", phase: "site_prep", start_date: "2026-03-01", end_date: "2026-03-07", duration_days: 7, percent_complete: 100, status: "complete", depends_on: [] },
  { id: "s2", name: "Excavation & footings", phase: "site_slab", start_date: "2026-03-08", end_date: "2026-03-20", duration_days: 13, percent_complete: 100, status: "complete", depends_on: ["s1"] },
  { id: "s3", name: "Slab pour", phase: "site_slab", start_date: "2026-03-21", end_date: "2026-03-28", duration_days: 8, percent_complete: 100, status: "complete", depends_on: ["s2"] },
  { id: "s4", name: "Frame", phase: "frame", start_date: "2026-04-01", end_date: "2026-05-10", duration_days: 40, percent_complete: 65, status: "in_progress", assignee_trade: "Carpenter", depends_on: ["s3"] },
  { id: "s-fi", name: "Frame inspection", phase: "frame", start_date: "2026-07-02", end_date: "2026-07-02", duration_days: 0, percent_complete: 0, status: "planned", task_type: "milestone", is_hold_point: true, depends_on: ["s4"] },
  { id: "s5", name: "Roofing", phase: "roofing", start_date: "2026-05-11", end_date: "2026-05-25", duration_days: 15, percent_complete: 10, status: "planned", assignee_trade: "Roof Plumber", order_by_date: "2026-06-20", depends_on: ["s4"] },
  { id: "s6", name: "Lock-up", phase: "lock_up", start_date: "2026-05-26", end_date: "2026-06-15", duration_days: 21, percent_complete: 0, status: "planned", depends_on: ["s5"] },
  { id: "s7", name: "Fit-out", phase: "fitout", start_date: "2026-06-16", end_date: "2026-09-30", duration_days: 106, percent_complete: 0, status: "planned", depends_on: ["s6"] },
];
route("GET", "/api/schedule/:projectId", () => ({ ok: true, tasks: TASKS, baselineLocked: true, baselineDate: "2026-02-25" }));
route("GET", "/api/schedule/:projectId/tasks", () => ({ ok: true, tasks: TASKS }));
route("GET", "/api/schedule/:projectId/dependencies", () => ({ ok: true, dependencies: [
  { id: "d1", from_task_id: "s1", to_task_id: "s2", type: "FS", lag: 0 },
  { id: "d2", from_task_id: "s4", to_task_id: "s5", type: "FS", lag: 0 },
] }));
route("GET", "/api/schedule/:projectId/eot", () => ({ ok: true, eots: [
  { id: "eot-1", title: "Wet weather — March", days: 4, status: "approved", raised_at: "2026-03-22" },
  { id: "eot-2", title: "Truss supplier delay", days: 6, status: "pending", raised_at: "2026-06-22" },
] }));

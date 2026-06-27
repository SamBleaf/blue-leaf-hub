/** UI Review fixtures — Schedule manager (Gantt/Sheet/Delays/Dep Map) (review-only). */
import { route } from "../registry.js";

const TASKS = [
  { id: "s1", name: "Site establishment", phase: "site_prep", start_date: "2026-03-01", end_date: "2026-03-07", duration_days: 7, percent_complete: 100, depends_on: [] },
  { id: "s2", name: "Excavation & footings", phase: "site_slab", start_date: "2026-03-08", end_date: "2026-03-20", duration_days: 13, percent_complete: 100, depends_on: ["s1"] },
  { id: "s3", name: "Slab pour", phase: "site_slab", start_date: "2026-03-21", end_date: "2026-03-28", duration_days: 8, percent_complete: 100, depends_on: ["s2"] },
  { id: "s4", name: "Frame", phase: "frame", start_date: "2026-04-01", end_date: "2026-05-10", duration_days: 40, percent_complete: 65, depends_on: ["s3"] },
  { id: "s5", name: "Roofing", phase: "roofing", start_date: "2026-05-11", end_date: "2026-05-25", duration_days: 15, percent_complete: 10, depends_on: ["s4"] },
  { id: "s6", name: "Lock-up", phase: "lock_up", start_date: "2026-05-26", end_date: "2026-06-15", duration_days: 21, percent_complete: 0, depends_on: ["s5"] },
  { id: "s7", name: "Fit-out", phase: "fitout", start_date: "2026-06-16", end_date: "2026-09-30", duration_days: 106, percent_complete: 0, depends_on: ["s6"] },
];
route("GET", "/api/schedule/:projectId", () => ({ ok: true, tasks: TASKS, baselineLocked: true, baselineDate: "2026-02-25" }));
route("GET", "/api/schedule/:projectId/tasks", () => ({ ok: true, tasks: TASKS }));
route("GET", "/api/schedule/:projectId/dependencies", () => ({ ok: true, dependencies: [
  { id: "d1", from_task_id: "s1", to_task_id: "s2", type: "FS", lag: 0 },
  { id: "d2", from_task_id: "s4", to_task_id: "s5", type: "FS", lag: 0 },
] }));
route("GET", "/api/schedule/:projectId/eot", () => ({ ok: true, claims: [
  { id: "eot-1", title: "Wet weather — March", days: 4, status: "approved", raised_at: "2026-03-22" },
] }));

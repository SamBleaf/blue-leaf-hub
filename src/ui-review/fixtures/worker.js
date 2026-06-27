/** UI Review fixtures — Worker timesheet PWA (/worker) (review-only). */
import { route } from "../registry.js";

const JOBS = [
  { id: "cjb-1", type: "carpentry", address: "5A Gibson Street, Marino SA (Denberger Built)", recent: true },
  { id: "proj-1", type: "project", address: "24 Naldera Cres, Glenelg SA", recent: false },
];
const TASKS = [
  { id: "wt-1", title: "First fix framing — rear extension", priority: "urgent", status: "open", category: "general", assigned_to: null, carpentry_job_id: "cjb-1" },
  { id: "wt-2", title: "Set out for slab edge", priority: "normal", status: "open", category: "general", assigned_to: null, carpentry_job_id: "cjb-1" },
  { id: "wt-3", title: "Tidy materials store", priority: "when_time_permits", status: "done", category: "general", completed_at: "2026-06-20T05:00:00Z", carpentry_job_id: "cjb-1" },
];

route("GET", "/api/worker/me", () => ({
  ok: true,
  employee: { id: "emp-4", name: "Dylan Clayton", trade: "carpenter", is_leading_hand: false, is_active: true },
  today_timesheet: { id: "wts-today", date: "2026-06-23", status: "submitted", timesheet_entries: [{ id: "we1", task_category: "first_fix_framing", phase: "frame", hours: 8, notes: "Framing" }] },
  yesterday_project: { address: "5A Gibson Street, Marino SA" },
  weekly_hours: 38,
  open_task_count: 2,
}));
route("GET", "/api/worker/projects", () => ({ ok: true, projects: [{ id: "proj-1", address: "24 Naldera Cres, Glenelg SA", status: "active" }], carpentryJobs: JOBS.filter((j) => j.type === "carpentry") }));
route("GET", "/api/worker/jobs", () => ({ ok: true, jobs: JOBS }));
route("GET", "/api/worker/tasks", () => ({ ok: true, tasks: TASKS, jobId: "cjb-1", jobType: "carpentry" }));
route("GET", "/api/worker/timesheets", () => ({ ok: true, timesheets: [
  { id: "wts-1", date: "2026-06-23", status: "submitted", hours: 8, project: "5A Gibson Street" },
  { id: "wts-2", date: "2026-06-20", status: "approved", hours: 7.6, project: "5A Gibson Street" },
  { id: "wts-3", date: "2026-06-19", status: "approved", hours: 8, project: "5A Gibson Street" },
], from: "2026-06-01" }));
route("GET", "/api/worker/timesheets/:date", ({ params }) => ({ ok: true, timesheet: { id: "wts-x", date: params.date, status: "submitted", timesheet_entries: [{ id: "we1", task_category: "first_fix_framing", phase: "frame", hours: 8, notes: "Framing" }] } }));

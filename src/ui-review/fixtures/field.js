/** UI Review fixtures — Field app (/field: home/jobs/tasks/whs/diary) (review-only). */
import { route } from "../registry.js";

const JOBS = [
  { id: "cjb-1", reference: "J1171", address: "5A Gibson Street, Marino SA", client_name: "Denberger Built", status: "active", type: "carpentry", open_tasks: 2 },
  { id: "proj-1", reference: "P-220", address: "24 Naldera Cres, Glenelg SA", client_name: "Harper Reno", status: "active", type: "project", open_tasks: 5 },
];
const TASKS = [
  { id: "ft-1", title: "Frame inspection prep", priority: "urgent", status: "open", category: "inspection", job_address: "5A Gibson Street" },
  { id: "ft-2", title: "Check waterproofing membrane", priority: "normal", status: "in_progress", category: "defect", job_address: "24 Naldera Cres" },
];
route("GET", "/api/field/summary", () => ({ ok: true, summary: { jobs: 2, open_tasks: 7, today_diary: false, whs_due: 1 } }));
route("GET", "/api/field/jobs", () => ({ ok: true, jobs: JOBS }));
route("GET", "/api/field/tasks", () => ({ ok: true, tasks: TASKS }));
route("GET", "/api/field/whs", () => ({ ok: true, items: [
  { id: "whs-1", title: "Daily pre-start / SWMS sign-on", status: "due", job_address: "5A Gibson Street" },
  { id: "whs-2", title: "Site fencing check", status: "done", job_address: "24 Naldera Cres" },
] }));
route("GET", "/api/field/diary", () => ({ ok: true, entries: [
  { id: "fd-1", date: "2026-06-20", weather: "Fine 18°C", note: "Frame progressing well.", photos: 2 },
] }));

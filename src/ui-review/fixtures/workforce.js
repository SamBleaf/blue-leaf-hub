/** UI Review fixtures — Workforce (approvals / team / history) (review-only). */
import { route } from "../registry.js";

const EMPLOYEES = ["Anthony Troiani", "Ben Regan", "Brayden Phillips", "Dylan Clayton", "Josh Manning", "Max Waller", "Sam Morris"].map((name, i) => ({
  id: `emp-${i + 1}`, name, trade: i === 6 ? "supervisor" : "carpenter", employment_type: "full_time",
  is_active: true, is_leading_hand: i === 6, email: i % 3 ? `worker${i}@uireview.local` : null, phone: i % 3 ? "0400 555 0" + i : null,
  staff_code: `EMP-00${i + 1}`, hourly_rate: [48.34, 54.29, 48.34, 54.75, 80.19, 65.58, 80.19][i],
  overtime_multiplier: 1.5, double_time_multiplier: 2.0, has_worker_link: i !== 1 && i !== 5, invite_sent_at: null,
}));
route("GET", "/api/workforce/employees", () => ({ ok: true, employees: EMPLOYEES }));

const PENDING = [0, 3, 4].map((i, k) => ({
  id: `ts-${k + 1}`, employee_id: EMPLOYEES[i].id, date: "2026-06-2" + (k + 1), status: "submitted", submitted_at: "2026-06-2" + (k + 1) + "T07:30:00Z",
  employees: { id: EMPLOYEES[i].id, name: EMPLOYEES[i].name, trade: EMPLOYEES[i].trade, hourly_rate: EMPLOYEES[i].hourly_rate, overtime_multiplier: 1.5 },
  projects: null, carpentry_jobs: { id: "cjb-1", reference: "J1171", address: "5A Gibson Street, Marino SA", client_name: "Denberger Built", buildexact_job_id: "bx-eca075ee" },
  timesheet_entries: [{ id: `e${k}1`, task_category: "first_fix_framing", hours: k === 1 ? 11 : 8, phase: "frame", notes: "Framing rear extension" }],
}));
route("GET", "/api/workforce/timesheets/pending", () => ({ ok: true, timesheets: PENDING }));
route("GET", "/api/workforce/timesheets", () => ({ ok: true, timesheets: PENDING.map((t) => ({ ...t, status: "approved", buildexact_synced_at: "2026-06-22T00:00:00Z" })) }));
route("GET", "/api/workforce/settings", () => ({ ok: true, settings: { overtime_threshold: 8, double_time_threshold: 10, standard_hours: 8, buildexact_sync_mode: "auto", working_days: ["Mon", "Tue", "Wed", "Thu", "Fri"] } }));
route("GET", "/api/workforce/completion-snapshot", () => ({ ok: true, week_start: "2026-06-16", employees: EMPLOYEES.map((e) => ({ id: e.id, name: e.name, days: { Mon: true, Tue: true, Wed: true, Thu: false, Fri: false } })) }));

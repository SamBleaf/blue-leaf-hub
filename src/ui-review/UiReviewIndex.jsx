// UI Review Mode — landing/index page (review-only). Rendered only at /ui-review when
// VITE_UI_REVIEW_MODE=true (gated + lazy-imported in App.jsx → tree-shaken from production).
// Links to every mocked route, pre-stamped with the right ?reviewRole=.
import React from "react";

const GROUPS = [
  {
    area: "Sales redesign (mock-up — Pass 2/3 direction)",
    routes: [
      ["Pipeline redesign mock-up", "/ui-review/sales-redesign-mockup", "admin"],
      ["Lead detail redesign mock-up", "/ui-review/sales-redesign-mockup/lead", "admin"],
      ["Lead detail — WON special case", "/ui-review/sales-redesign-mockup/lead-won", "admin"],
    ],
  },
  {
    area: "Operations redesign (mock-up — H2 direction)",
    routes: [
      ["Operations home redesign mock-up", "/ui-review/ops-redesign-mockup", "admin"],
      ["Job command centre redesign mock-up", "/ui-review/ops-redesign-mockup/job", "admin"],
      ["Schedule redesign mock-up", "/ui-review/ops-redesign-mockup/schedule", "admin"],
    ],
  },
  {
    area: "Tender/RFQ + Procurement redesign (mock-up — H3 direction)",
    routes: [
      ["Tender/RFQ home redesign mock-up", "/ui-review/h3-redesign-mockup", "admin"],
      ["RFQ package detail redesign mock-up", "/ui-review/h3-redesign-mockup/package", "admin"],
      ["Procurement redesign mock-up", "/ui-review/h3-redesign-mockup/procurement", "admin"],
    ],
  },
  {
    area: "Admin / Director",
    routes: [
      ["Director dashboard", "/home", "director"],
      ["Sales pipeline", "/sales", "admin"],
      ["Sales action queue", "/sales?view=actions", "admin"],
      ["Lead detail — enquiry → won (8 stages)", "/sales/lead-1", "admin"],
      ["Tender board", "/tender-manager/board", "admin"],
      ["Tender detail", "/tender-manager/board/job-1003", "admin"],
      ["Quote Tracker", "/tender-manager/rfq-packages", "admin"],
      ["Subcontractors", "/tender-manager/subcontractors", "admin"],
      ["Cost intelligence", "/tender-manager/cost-intelligence", "admin"],
      ["Fee proposals", "/tender-manager/fee-proposal", "admin"],
      ["Operations project list", "/operations", "admin"],
      ["Operations project command centre", "/operations/proj-1", "admin"],
      ["Schedule manager", "/operations/proj-1/schedule", "admin"],
      ["Procurement", "/operations/procurement", "admin"],
      ["Finance manager", "/finance", "admin"],
      ["Finance job command centre", "/finance/jobs/job-1001", "admin"],
      ["Workforce", "/workforce", "admin"],
    ],
  },
  {
    area: "Field / Supervisor",
    routes: [
      ["Supervisor home", "/supervisor", "supervisor"],
      ["Field home", "/field", "supervisor"],
      ["Field jobs", "/field/jobs", "supervisor"],
      ["Field tasks", "/field/tasks", "supervisor"],
      ["Field WHS", "/field/whs", "supervisor"],
      ["Field diary", "/field/diary", "supervisor"],
    ],
  },
  {
    area: "Worker app",
    routes: [
      ["Worker home", "/worker", "employee"],
      ["Log hours", "/worker/timesheet/log", "employee"],
      ["Worker tasks", "/worker/tasks", "employee"],
      ["Worker week / timesheets", "/worker/week", "employee"],
    ],
  },
  {
    area: "Client Portal v2",
    routes: [
      ["Portal home", "/client-portal", "client"],
      ["Actions / decisions", "/client-portal/actions", "client"],
      ["Journey / milestones", "/client-portal/journey", "client"],
      ["Selections", "/client-portal/selections", "client"],
      ["Documents", "/client-portal/documents", "client"],
      ["Messages", "/client-portal/messages", "client"],
    ],
  },
];

export default function UiReviewIndex() {
  return (
    <div className="min-h-screen bg-page px-6 py-8 text-ink" data-ui-review-ready="true">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold">Blue Leaf Hub — UI Review Mode</h1>
        <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <strong>Non-production.</strong> All data is local mock/fixture data. No live Supabase,
          Buildxact, Dropbox, Gmail, or production credentials are used. Auth is mocked client-side.
        </div>
        <p className="mt-4 text-sm text-muted">
          Each link opens the view with a pre-set <code>?reviewRole=</code>. Resize your browser to
          desktop (1440×900), tablet (834×1112), or mobile (390×844) to review responsively.
        </p>

        {GROUPS.map((g) => (
          <section key={g.area} className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{g.area}</h2>
            <ul className="mt-2 divide-y divide-hairline rounded-card border border-hairline bg-surface">
              {g.routes.map(([label, path, role]) => (
                <li key={path + role}>
                  <a
                    href={`${path}?reviewRole=${role}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-page focus-ring"
                  >
                    <span className="font-medium">{label}</span>
                    <span className="text-xs text-muted">{path} · {role}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";

// Short explainer card linking out to the actual worker field app (own PWA/layout —
// not embedded here). Keep this pane minimal.
export default function FieldAppPane() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-primary tracking-tight">Field app</h1>
        <p className="text-sm text-muted">The mobile app site workers use for tasks, WHS and the site diary.</p>
      </header>

      <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm max-w-lg">
        <h2 className="text-lg font-semibold text-primary">Worker field app</h2>
        <p className="mt-1 text-sm text-muted">
          A separate mobile-first layout for admins, supervisors and employees on site — jobs, tasks, WHS
          checklists and the site diary. It runs as its own app, not inside this settings pane.
        </p>
        <Link
          to="/field"
          className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          Open field app →
        </Link>
      </section>
    </div>
  );
}

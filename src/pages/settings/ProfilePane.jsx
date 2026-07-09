import { useAuth } from "../../lib/useAuth.js";
import { ROLE_LABELS } from "../../lib/roles.js";

// Placeholder for a real account page. Read-only for now — shows who is logged in.
export default function ProfilePane() {
  const { user, profile, role } = useAuth();
  const name = profile?.full_name || "—";
  const email = profile?.email || user?.email || "—";
  const roleLabel = ROLE_LABELS[role] || role || "—";

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-primary tracking-tight">My profile</h1>
        <p className="text-sm text-muted">Your account details. Read-only for now.</p>
      </header>

      <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm max-w-lg">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="font-semibold text-ink">Name</dt>
            <dd className="mt-0.5 text-muted">{name}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Email</dt>
            <dd className="mt-0.5 text-muted">{email}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Role</dt>
            <dd className="mt-0.5 text-muted">{roleLabel}</dd>
          </div>
        </dl>
      </section>

      <p className="text-xs text-muted">Password changes coming soon.</p>
    </div>
  );
}

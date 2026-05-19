import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/useAuth.js";
import { getSupabase } from "../lib/supabaseClient.js";

export default function MyPortal() {
  const { user, profile, signOut } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const email = profile?.email || user?.email;
    if (!email) {
      setLoading(false);
      return;
    }
    const sb = getSupabase();
    if (!sb) {
      setError("Database not configured.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    sb.from("projects")
      .select("id, address, portal_enabled, portal_token, portal_client_name")
      .eq("portal_client_email", email)
      .eq("portal_enabled", true)
      .order("address")
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e) setError(e.message);
        else setProjects(data || []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.email, user?.email]);

  return (
    <div className="min-h-screen bg-page font-sans">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <h1 className="text-lg font-bold text-primary">My project portal</h1>
            <p className="text-sm text-muted">{profile?.full_name || profile?.email}</p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-sm font-semibold text-muted hover:text-ink"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {loading ? <p className="text-sm text-muted">Loading your projects…</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}

        {!loading && !error && !projects.length ? (
          <div className="rounded-card border border-hairline bg-surface p-8 text-center">
            <p className="text-sm text-muted">
              No active project portals are linked to your account yet. Contact Blue Leaf Building if you
              expected access.
            </p>
          </div>
        ) : null}

        <ul className="space-y-3">
          {projects.map((p) => (
            <li key={p.id} className="rounded-card border border-hairline bg-surface p-4 shadow-sm">
              <h2 className="font-semibold text-ink">{p.address || "Project"}</h2>
              {p.portal_token ? (
                <Link
                  to={`/portal/${p.portal_token}`}
                  className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                >
                  Open portal
                </Link>
              ) : (
                <p className="mt-2 text-sm text-muted">Portal link not ready — contact your builder.</p>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

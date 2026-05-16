import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";

export default function OperationsList() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabaseConfigured) {
      setError("Configure Supabase.");
      return;
    }
    const sb = getSupabase();
    const { data, error: err } = await sb
      .from("projects")
      .select(
        `id, address, status, tentative_start_date, accepted_trades, buildexact_job_id, buildexact_linked_at, buildexact_link_source, created_at,
         jobs ( id, won_at, dropbox_shared_link, dropbox_link )`
      )
      .order("created_at", { ascending: false });
    if (err) setError(err.message);
    else {
      setRows(data || []);
      setError("");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!supabaseConfigured) {
    return <p className="text-sm text-muted">Supabase not configured.</p>;
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Operations Manager</p>
        <h1 className="text-3xl font-semibold text-primary tracking-tight">Active projects</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Won tenders appear here. Issue POs, link Buildexact, track webhook auto-link.</p>
      </header>
      {error ? <div className="text-sm text-danger">{error}</div> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No projects yet — mark a tender as won in Tender Manager.</p>
        ) : (
          rows.map((p) => {
            const trades = Array.isArray(p.accepted_trades) ? p.accepted_trades : [];
            const linked = Boolean(p.buildexact_job_id);
            const won = p.jobs?.won_at ? new Date(p.jobs.won_at).toLocaleDateString("en-AU") : "—";
            return (
              <Link
                key={p.id}
                to={`/operations/${p.id}`}
                className="block rounded-card border border-hairline bg-surface p-5 shadow-sm transition hover:border-primary/40"
              >
                <h2 className="text-lg font-bold text-primary">{p.address}</h2>
                <div className="mt-2 grid gap-1 text-xs text-muted">
                  <div>Date won: {won}</div>
                  <div>Accepted trades: {trades.length}</div>
                  <div>
                    Buildexact: {linked ? <span className="font-semibold text-accent">Linked</span> : <span className="text-warning">Not linked</span>}
                  </div>
                  <div>
                    Webhook:{" "}
                    {p.buildexact_link_source === "webhook"
                      ? "Auto-linked"
                      : p.buildexact_link_source === "manual"
                        ? "Manually linked"
                        : "Pending"}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

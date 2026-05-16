import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";

function fmt$(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(n));
}

export default function FeeProposalList() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!supabaseConfigured) return;
    const sb = getSupabase();
    const { data, error } = await sb.from("fee_proposals").select("*").order("updated_at", { ascending: false }).limit(100);
    if (error) setErr(error.message);
    else {
      setRows(data || []);
      setErr("");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!supabaseConfigured) {
    return <p className="text-sm text-muted">Supabase required.</p>;
  }

  return (
    <div className="space-y-6 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Tender Manager</p>
          <h1 className="text-3xl font-semibold text-primary tracking-tight">Fee proposals</h1>
          <p className="mt-1 text-sm text-muted">Buildexact import, Word template merge (docxtemplater), and client send.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/tender-manager/fee-proposal/template-setup" className="rounded-lg border border-hairline bg-page px-4 py-2 text-sm font-semibold text-ink">
            Template setup
          </Link>
          <Link to="/tender-manager/fee-proposal/new" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">
            New proposal
          </Link>
        </div>
      </header>

      {err ? <div className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{err}</div> : null}

      <div className="grid gap-4 md:grid-cols-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No fee proposals yet. Create one from a Buildexact XLSX export.</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="rounded-card border border-hairline bg-surface p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-bold text-primary">Quote {r.quote_number ?? "—"}</div>
                  <div className="text-sm text-ink">{r.address || "—"}</div>
                  <div className="mt-1 text-xs text-muted">{r.client_name || ""}</div>
                </div>
                <span className="rounded-full bg-page px-2 py-0.5 text-[10px] font-bold uppercase text-muted">{r.status || "draft"}</span>
              </div>
              <div className="mt-2 text-xs text-muted">Updated {new Date(r.updated_at).toLocaleString("en-AU")}</div>
              <div className="mt-2 text-sm font-semibold text-ink">{fmt$(r.total_inc_gst)}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to={`/tender-manager/fee-proposal/${r.id}`} className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-accent">
                  Edit
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

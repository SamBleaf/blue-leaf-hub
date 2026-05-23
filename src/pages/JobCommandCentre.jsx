import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useProject } from "../lib/ProjectContext.jsx";
import ProgressClaims from "../components/finance/ProgressClaims.jsx";
import Variations from "../components/finance/Variations.jsx";

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt(n, opts = {}) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency", currency: "AUD", maximumFractionDigits: 0, ...opts
  }).format(n);
}

function fmtPct(n) {
  if (n == null) return "—";
  return `${Number(n).toFixed(1)}%`;
}

// ── Margin health ─────────────────────────────────────────────────────────────

function marginHealth(pct, target, floor) {
  if (pct == null) return "unknown";
  if (pct >= target + 1) return "green";
  if (pct >= target - 1) return "amber";
  return pct >= floor ? "red" : "critical";
}

const HEALTH_STYLES = {
  green:    "text-green-700 bg-green-50 border-green-200",
  amber:    "text-amber-700 bg-amber-50 border-amber-200",
  red:      "text-red-700 bg-red-50 border-red-200",
  critical: "text-red-800 bg-red-100 border-red-300",
  unknown:  "text-muted bg-page border-hairline",
};

function MarginIndicator({ label, pct, target, floor }) {
  const health = marginHealth(pct, target, floor);
  const emoji = health === "green" ? "🟢" : health === "amber" ? "🟡" : health === "unknown" ? "⬜" : "🔴";
  return (
    <div className={`rounded-lg border px-3 py-2 ${HEALTH_STYLES[health]}`}>
      <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-xl font-bold mt-0.5">{emoji} {fmtPct(pct)}</div>
      {target && <div className="text-[10px] opacity-60 mt-0.5">Target: {target}%</div>}
    </div>
  );
}

// ── KPI bar ───────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }) {
  return (
    <div className="rounded-card border border-hairline bg-surface px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</div>
      <div className="text-lg font-bold text-ink mt-0.5">{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Budget vs Actual row ──────────────────────────────────────────────────────

const STATUS_ICON = { ok: "🟢", watch: "🟡", over: "🔴" };

function BudgetRow({ row, onEdit }) {
  return (
    <tr className="border-b border-hairline hover:bg-page transition">
      <td className="py-2 pr-3 text-sm text-ink">{row.name}</td>
      <td className="py-2 pr-3 text-sm text-right text-ink">{fmt(row.budget_amount)}</td>
      <td className="py-2 pr-3 text-sm text-right text-ink">{fmt(row.actual_amount)}</td>
      <td className="py-2 pr-3 text-sm text-right text-ink">{fmt(row.forecast_amount)}</td>
      <td className="py-2 text-sm text-right">
        <span className={`font-semibold ${row.status === "over" ? "text-red-700" : row.status === "watch" ? "text-amber-700" : "text-green-700"}`}>
          {STATUS_ICON[row.status]} {row.variance > 0 ? "+" : ""}{fmt(row.variance)}
        </span>
      </td>
      <td className="py-2 pl-2 text-right">
        <button
          type="button"
          onClick={() => onEdit(row)}
          className="text-muted hover:text-primary transition"
          title="Edit budget"
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </td>
    </tr>
  );
}

// ── Budget edit modal ─────────────────────────────────────────────────────────

function BudgetEditModal({ row, jobId, onSaved, onClose }) {
  const [amount, setAmount] = useState(String(row.budget_amount || ""));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    if (!reason.trim()) { setError("Reason required"); return; }
    setSaving(true); setError(null);
    const r = await fetch(`/api/finance/jobs/${jobId}/budget/${row.trade_category_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budget_amount: Number(amount), reason }),
    });
    const j = await r.json();
    setSaving(false);
    if (j.ok) { onSaved(); onClose(); }
    else setError(j.error || "Failed to save");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-sm rounded-xl border border-hairline bg-surface shadow-xl p-5 space-y-4">
        <p className="font-bold text-ink text-sm">Edit budget — {row.name}</p>
        <div>
          <label className="text-xs font-bold text-ink mb-1 block">Budget amount (ex GST)</label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-sm text-muted">$</span>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full rounded-lg border border-hairline pl-7 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-ink mb-1 block">Reason for change <span className="text-danger">*</span></label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="e.g. Concrete re-quoted at higher rate"
            className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none resize-none" />
        </div>
        {error && <p className="text-xs text-danger font-medium">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-lg border border-hairline py-2 text-sm font-semibold text-muted">Cancel</button>
          <button type="button" onClick={save} disabled={saving}
            className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-white disabled:opacity-40">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── WIPAA accordion ───────────────────────────────────────────────────────────

function WipaaSection({ jobId, wipaa, onReviewSaved }) {
  const [open, setOpen] = useState(false);
  const [forecast, setForecast] = useState(wipaa?.forecast_total_cost ?? "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const overdue = wipaa?.review_overdue;

  useEffect(() => {
    if (overdue) setOpen(true);
  }, [overdue]);

  async function save() {
    setSaving(true);
    const r = await fetch(`/api/finance/jobs/${jobId}/wipaa/review`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forecast_total_cost: forecast || null, notes })
    });
    const j = await r.json();
    setSaving(false);
    if (j.ok) { onReviewSaved?.(); setNotes(""); }
  }

  return (
    <div className={`rounded-card border ${overdue ? "border-red-300 bg-red-50/30" : "border-hairline"}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-ink">WIPAA Review</span>
          {overdue && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-red-700 bg-red-100 border border-red-200 rounded-full px-2 py-0.5">
              {wipaa.days_since_review}d overdue
            </span>
          )}
          {!overdue && wipaa?.days_since_review != null && (
            <span className="text-xs text-muted">Last reviewed {wipaa.days_since_review}d ago</span>
          )}
        </div>
        <svg className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && wipaa && (
        <div className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-muted text-xs">Cost to date</span>
              <p className="font-semibold">{fmt(wipaa.cost_to_date)}</p>
            </div>
            <div>
              <span className="text-muted text-xs">Forecast total cost</span>
              <p className="font-semibold">{fmt(wipaa.forecast_total_cost)}</p>
            </div>
            <div>
              <span className="text-muted text-xs">% Complete</span>
              <p className="font-semibold">{wipaa.pct_complete != null ? `${(wipaa.pct_complete * 100).toFixed(0)}%` : "—"}</p>
            </div>
            <div>
              <span className="text-muted text-xs">Projected margin</span>
              <p className="font-semibold">{fmtPct(wipaa.projected_margin_pct)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-ink">Update forecast total cost</label>
            <input
              type="number"
              value={forecast}
              onChange={e => setForecast(e.target.value)}
              placeholder="e.g. 980000"
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Review notes (optional)…"
              rows={2}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save WIPAA review"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function JobCommandCentre() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { allProjects, selectProject } = useProject();

  const [summary, setSummary] = useState(null);
  const [actuals, setActuals] = useState(null);
  const [wipaa, setWipaa] = useState(null);
  const [action, setAction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAllBudget, setShowAllBudget] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState(null);
  const claimsSectionRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const cc = await fetch(`/api/finance/jobs/${jobId}/command-centre`).then(r => r.json()).catch(() => null);
    if (cc?.ok) {
      setSummary({ ok: true, job: cc.job, kpis: {
        ...cc.kpis,
        signed_variations: cc.variations?.signed_total ?? 0,
        unsigned_variations: cc.variations?.sent_total ?? 0,
      } });
      // Normalise budget_vs_actual → rows + totals shape the UI expects
      const rows = (cc.budget_vs_actual || []).map(r => ({
        ...r,
        variance: (r.actual_amount || 0) - (r.budget_amount || 0),
        status: r.actual_amount > r.budget_amount * 1.1 ? "over" : r.actual_amount > r.budget_amount * 0.9 ? "watch" : "ok",
      }));
      const totals = rows.length ? {
        budget: rows.reduce((s, r) => s + (r.budget_amount || 0), 0),
        actual: rows.reduce((s, r) => s + (r.actual_amount || 0), 0),
        forecast: rows.reduce((s, r) => s + (r.forecast_amount || 0), 0),
      } : null;
      setActuals({ ok: true, rows, totals });
      setWipaa({ ...cc.wipaa, review_overdue: (cc.days_since_wipaa_review ?? 0) > 30, days_since_review: cc.days_since_wipaa_review });
      setAction({
        ok: true,
        pending_invoices: cc.pending_approvals || [],
        overdue_claims: (cc.claims || []).filter(c => c.status === "overdue"),
      });
    }
    setLoading(false);

    const project = allProjects.find(p => p.job_id === jobId);
    if (project) selectProject(project);
  }, [jobId, allProjects, selectProject]);

  useEffect(() => { load(); }, [load]);

  const seedBudget = useCallback(async () => {
    setSeeding(true);
    setSeedError(null);
    try {
      const r = await fetch(`/api/finance/jobs/${jobId}/budget/seed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Seed failed");
      await load();
    } catch (e) {
      setSeedError(e.message);
    }
    setSeeding(false);
  }, [jobId, load]);

  if (loading) {
    return (
      <div className="px-4 md:px-6 py-6 space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-card border border-hairline bg-surface h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!summary?.ok) {
    return (
      <div className="px-4 md:px-6 py-12 text-center">
        <p className="text-sm font-semibold text-ink">Job not found</p>
        <button type="button" onClick={() => navigate("/finance/jobs")} className="mt-3 text-sm text-primary hover:underline">
          ← Back to job list
        </button>
      </div>
    );
  }

  const { job, kpis } = summary;
  const target = job.target_margin_pct;
  const floor = job.floor_margin_pct;

  const budgetRows = actuals?.rows || [];
  const budgetTotals = actuals?.totals;
  const visibleRows = showAllBudget ? budgetRows : budgetRows.filter(r => r.budget_amount > 0 || r.actual_amount > 0).slice(0, 10);

  const buildPct = wipaa?.pct_complete != null ? wipaa.pct_complete * 100 : null;
  const claimsPct = kpis.contract_value > 0 ? (kpis.claims_issued / kpis.contract_value) * 100 : null;
  const underclaim = buildPct != null && claimsPct != null && (buildPct - claimsPct) > 10
    ? Math.round((buildPct / 100 - claimsPct / 100) * kpis.contract_value)
    : null;

  return (
    <div className="px-4 md:px-6 py-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => navigate("/finance/jobs")} className="mt-1 text-muted hover:text-ink transition">
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-ink">{job.address}</h1>
          <p className="text-xs text-muted mt-0.5">
            Contract {fmt(kpis.contract_value)}
            {kpis.signed_variations > 0 && ` · incl. ${fmt(kpis.signed_variations)} signed variations`}
            {kpis.unsigned_variations > 0 && (
              <span className="text-amber-600"> · {fmt(kpis.unsigned_variations)} unsigned</span>
            )}
          </p>
        </div>
        {job.financial_locked && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
            🔒 Locked
          </span>
        )}
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Contract" value={fmt(kpis.contract_value)} />
        <KpiCard label="Claims issued" value={fmt(kpis.claims_issued)} />
        <KpiCard label="Claims paid" value={fmt(kpis.claims_paid)} />
        <KpiCard label="Actual costs" value={fmt(kpis.actual_costs)} />
        <MarginIndicator label="Working margin" pct={kpis.working_margin_pct} target={target} floor={floor} />
        <MarginIndicator label="Forecast margin" pct={kpis.forecast_margin_pct} target={target} floor={floor} />
      </div>

      {/* Underclaim alert */}
      {underclaim > 0 && (
        <div className="rounded-card border border-amber-300 bg-amber-50 px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-amber-700 font-bold text-sm">⚠ Underclaim alert</span>
            <span className="text-amber-700 text-sm">
              Build {fmtPct(buildPct)} · Claimed {fmtPct(claimsPct)} · ~{fmt(underclaim)} unclaimed
            </span>
          </div>
          <button type="button"
            onClick={() => claimsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="shrink-0 rounded-lg bg-amber-700 text-white text-xs font-bold px-3 py-1.5 hover:bg-amber-800">
            Draft claim →
          </button>
        </div>
      )}

      {/* Requires Action */}
      {((action?.pending_invoices?.length > 0) || (action?.overdue_claims?.length > 0)) && (
        <div className="rounded-card border border-red-200 bg-red-50/30 px-4 py-4 space-y-2">
          <h2 className="text-sm font-bold text-red-800">Requires Action</h2>
          {action.pending_invoices.map(inv => (
            <div key={inv.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface border border-hairline px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-ink">{inv.supplier_name || "Unknown supplier"}</p>
                <p className="text-xs text-muted">
                  {fmt(inv.amount_ex_gst)} ex GST
                  {inv.ai_job_match_confidence != null && ` · Job match: ${Math.round(inv.ai_job_match_confidence)}%`}
                  {inv.ai_trade_confidence != null && ` · Trade: ${Math.round(inv.ai_trade_confidence)}%`}
                </p>
              </div>
              <a href="/finance/approvals" className="shrink-0 text-xs text-primary font-semibold hover:underline">
                Review →
              </a>
            </div>
          ))}
          {action.overdue_claims.map(c => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface border border-red-200 px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-red-700">Claim #{c.claim_number} overdue</p>
                <p className="text-xs text-muted">
                  {fmt(c.amount_ex_gst)} ex GST · Due {c.due_date ? new Date(c.due_date).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—"}
                </p>
              </div>
              <span className="shrink-0 text-xs font-bold text-red-700">Chase payment</span>
            </div>
          ))}
        </div>
      )}

      {/* Budget vs Actual */}
      <div className="rounded-card border border-hairline bg-surface overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
          <h2 className="text-sm font-bold text-ink">Budget vs Actual</h2>
          <div className="flex items-center gap-3">
            {seedError && <span className="text-xs text-red-600">{seedError}</span>}
            <button
              type="button"
              onClick={seedBudget}
              disabled={seeding}
              className="text-xs text-primary font-semibold hover:underline disabled:opacity-40"
            >
              {seeding ? "Seeding…" : budgetRows.length === 0 ? "Seed budget from Buildxact →" : "Re-seed from Buildxact"}
            </button>
          </div>
        </div>

        {budgetRows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted">
            No budget seeded yet.{" "}
            <button type="button" onClick={seedBudget} disabled={seeding} className="text-primary hover:underline font-semibold disabled:opacity-40">
              {seeding ? "Seeding…" : "Seed from Buildxact"}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-hairline bg-page">
                  <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-muted">Category</th>
                  <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-muted text-right">Budget</th>
                  <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-muted text-right">Actual</th>
                  <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-muted text-right">Forecast</th>
                  <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-muted text-right">Variance</th>
                  <th className="px-4 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {visibleRows.map(row => (
                  <BudgetRow key={row.trade_category_id} row={row} onEdit={setEditingBudget} />
                ))}
                {budgetTotals && (
                  <tr className="bg-page">
                    <td className="px-4 py-2.5 text-sm font-bold text-ink">Total</td>
                    <td className="px-4 py-2.5 text-sm font-bold text-ink text-right">{fmt(budgetTotals.budget)}</td>
                    <td className="px-4 py-2.5 text-sm font-bold text-ink text-right">{fmt(budgetTotals.actual)}</td>
                    <td className="px-4 py-2.5 text-sm font-bold text-ink text-right">{fmt(budgetTotals.forecast)}</td>
                    <td className="px-4 py-2.5 text-sm font-bold text-right">
                      <span className={budgetTotals.actual > budgetTotals.budget ? "text-red-700" : "text-green-700"}>
                        {fmt(budgetTotals.actual - budgetTotals.budget)}
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {!showAllBudget && budgetRows.length > visibleRows.length && (
              <div className="px-4 py-2.5 border-t border-hairline">
                <button type="button" onClick={() => setShowAllBudget(true)} className="text-xs text-primary hover:underline font-semibold">
                  Show all {budgetRows.length} categories
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* WIPAA */}
      {wipaa && (
        <WipaaSection jobId={jobId} wipaa={wipaa} onReviewSaved={load} />
      )}

      {/* Variations */}
      <div className="rounded-card border border-hairline bg-surface px-4 py-4">
        <h2 className="text-sm font-bold text-ink mb-4">Variations</h2>
        <Variations jobId={jobId} onUpdate={load} />
      </div>

      {/* Progress Claims */}
      <div ref={claimsSectionRef} className="rounded-card border border-hairline bg-surface px-4 py-4">
        <h2 className="text-sm font-bold text-ink mb-4">Progress Claims</h2>
        <ProgressClaims jobId={jobId} onUpdate={load} />
      </div>

      {/* Budget edit modal */}
      {editingBudget && (
        <BudgetEditModal
          row={editingBudget}
          jobId={jobId}
          onSaved={() => { setActuals(null); load(); }}
          onClose={() => setEditingBudget(null)}
        />
      )}

    </div>
  );
}

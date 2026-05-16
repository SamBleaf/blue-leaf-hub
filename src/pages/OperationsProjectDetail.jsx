import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";
import { loadCompanySettings } from "../lib/companySettings.js";
import { formatSignatureFooter, loadEmailSignature } from "../lib/rfqSettings.js";

const PHASE_ORDER = ["site_prep", "substructure", "frame", "rough_in", "lock_up", "fitout", "completion"];
const PHASE_LABELS = {
  site_prep: "Site prep",
  substructure: "Substructure",
  frame: "Frame",
  rough_in: "Rough-in",
  lock_up: "Lock-up",
  fitout: "Fit-out",
  completion: "Completion"
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function OperationsProjectDetail() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "dashboard";

  const [project, setProject] = useState(null);
  const [pos, setPos] = useState([]);
  const [error, setError] = useState("");
  const [beId, setBeId] = useState("");
  const [poTrade, setPoTrade] = useState(null);
  const [sched, setSched] = useState("");
  const [busy, setBusy] = useState(false);
  const [dashLoading, setDashLoading] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [diaryPreview, setDiaryPreview] = useState([]);
  const [complianceSubs, setComplianceSubs] = useState([]);
  const [reports, setReports] = useState([]);

  const load = useCallback(async () => {
    if (!supabaseConfigured) {
      setError("Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
    if (!projectId) {
      setError("Missing project ID.");
      return;
    }
    const sb = getSupabase();
    const { data: p, error: e1 } = await sb
      .from("projects")
      .select(`*, jobs ( id, address, won_at, dropbox_shared_link, dropbox_link, dropbox_internal_path )`)
      .eq("id", projectId)
      .single();
    if (e1) {
      setError(e1.message);
      return;
    }
    setProject(p);
    setBeId(p?.buildexact_job_id || "");
    const { data: po, error: e2 } = await sb.from("purchase_orders").select("*").eq("project_id", projectId);
    if (e2) setError(e2.message);
    else setPos(po || []);
  }, [projectId]);

  const loadDashboardData = useCallback(async () => {
    if (!projectId || tab !== "dashboard") return;
    setDashLoading(true);
    try {
      const [ts, di, co, rep] = await Promise.all([
        fetch(`/api/schedule/${projectId}`).then((r) => r.json()),
        fetch(`/api/diary/${projectId}?limit=3`).then((r) => r.json()),
        fetch(`/api/whs/${projectId}/compliance`).then((r) => r.json()),
        fetch(`/api/whs/${projectId}/reports`).then((r) => r.json())
      ]);
      setTasks(ts.ok ? ts.tasks || [] : []);
      setDiaryPreview(di.ok ? di.entries || [] : []);
      setComplianceSubs(co.ok ? co.subcontractors || [] : []);
      setReports(rep.ok ? rep.reports || [] : []);
    } catch {
      setTasks([]);
      setDiaryPreview([]);
      setComplianceSubs([]);
      setReports([]);
    } finally {
      setDashLoading(false);
    }
  }, [projectId, tab]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  async function saveTentative(isoDate) {
    const sb = getSupabase();
    const { error: u } = await sb.from("projects").update({ tentative_start_date: isoDate || null }).eq("id", projectId);
    if (u) setError(u.message);
    else load();
  }

  async function manualLinkBuildexact() {
    const sb = getSupabase();
    const id = beId.trim();
    if (!id) return;
    const now = new Date().toISOString();
    const { error: u } = await sb
      .from("projects")
      .update({ buildexact_job_id: id, buildexact_linked_at: now, buildexact_link_source: "manual", buildexact_last_sync: now })
      .eq("id", projectId);
    if (u) setError(u.message);
    else load();
  }

  async function issuePo() {
    if (!poTrade || !project) return;
    const co = loadCompanySettings();
    const sig = loadEmailSignature();
    const sigFooter = formatSignatureFooter(sig);
    const sigLogo = String(sig.logoDataUrl || "").trim();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/po/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          jobId: project.job_id,
          jobAddress: project.address,
          trade: poTrade.trade,
          poPrefix: co.poPrefix || "BLB",
          logoDataUrl: co.logoDataUrl || "",
          toEmail: poTrade.email,
          contactName: poTrade.contact || "",
          subcontractorId: poTrade.subcontractor_id || "",
          rfqId: poTrade.rfq_id || "",
          scheduledCompletion: sched || null,
          tentativeStartLabel: project.tentative_start_date || "TBC",
          tentative_start_date: project.tentative_start_date,
          buildexactJobId: project.buildexact_job_id || "",
          lineItems: [
            {
              description: `${poTrade.trade} — ${poTrade.subcontractor || ""}`.trim(),
              qty: "1",
              unit: "lot",
              unitCost: Number(poTrade.quote_amount) || 0,
              lineTotal: Number(poTrade.quote_amount) || 0
            }
          ],
          company: {
            companyName: co.companyName,
            abn: co.abn,
            address: co.address,
            phone: co.phone,
            email: co.email,
            website: co.website
          },
          vendor: {
            businessName: poTrade.subcontractor,
            contact: poTrade.contact,
            email: poTrade.email,
            phone: poTrade.phone || ""
          },
          termsPage2: co.defaultPoTerms,
          signatureFooter: sigFooter,
          signatureLogoDataUrl: sigLogo
        })
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "PO issue failed");
      setPoTrade(null);
      setSched("");
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  const dash = useMemo(() => {
    const tday = todayIso();
    const active = tasks.filter((t) => t.status !== "complete");
    let currentPhase = "—";
    for (const ph of PHASE_ORDER) {
      if (active.some((t) => t.phase === ph)) {
        currentPhase = PHASE_LABELS[ph] || ph;
        break;
      }
    }
    const onSite = tasks.filter((t) => t.start_date && t.end_date && t.start_date <= tday && t.end_date >= tday && t.status !== "complete").map((t) => t.trade);
    const holdCandidates = tasks
      .filter((t) => t.is_hold_point && t.status !== "complete")
      .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
    const nextHold = holdCandidates[0]?.name || "—";

    const proc = tasks
      .filter((t) => t.order_by_date && t.status !== "complete")
      .sort((a, b) => String(a.order_by_date).localeCompare(String(b.order_by_date)))
      .slice(0, 5);

    let whsExp = 0;
    let whsSoon = 0;
    for (const s of complianceSubs) {
      for (const d of s.documents || []) {
        const st = d.computed_status || d.status;
        if (st === "expired") whsExp += 1;
        else if (st === "expiring_soon") whsSoon += 1;
      }
    }
    const openRep = reports.filter((r) => r.status === "open" || r.status === "in_progress").length;

    const total = tasks.length;
    const completeN = tasks.filter((t) => t.status === "complete").length;
    const pct = total ? Math.round((completeN / total) * 100) : 0;
    const incomplete = tasks.filter((t) => t.status !== "complete" && t.end_date);
    const projected =
      incomplete.length === 0
        ? "—"
        : incomplete.reduce((mx, t) => (t.end_date > mx ? t.end_date : mx), incomplete[0].end_date);
    const aiN = tasks.filter((t) => t.ai_flag).length;

    return {
      tday,
      currentPhase,
      onSite,
      nextHold,
      proc,
      whsExp,
      whsSoon,
      openRep,
      total,
      completeN,
      pct,
      projected,
      aiN
    };
  }, [tasks, complianceSubs, reports]);

  if (!project) {
    return (
      <p className="text-sm text-muted">
        {error || "Loading…"}{" "}
        <Link to="/operations" className="font-semibold text-accent underline">
          Back
        </Link>
      </p>
    );
  }

  const trades = Array.isArray(project.accepted_trades) ? project.accepted_trades : [];
  const drop = String(project.dropbox_shared_link || project.jobs?.dropbox_shared_link || project.jobs?.dropbox_link || "").trim();
  const issuedForTrade = (t) => pos.some((p) => p.trade === t.trade && p.status === "issued");
  const wonAt = project.jobs?.won_at ? new Date(project.jobs.won_at).toLocaleDateString("en-AU") : null;

  return (
    <div className="space-y-6 pb-24">
      <header className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-primary">{project.address}</h1>
        {wonAt ? <p className="mt-1 text-sm text-muted">Won {wonAt}</p> : <p className="mt-1 text-sm text-muted">Project</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          {drop ? (
            <a href={drop} target="_blank" rel="noreferrer" className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold text-primary">
              Dropbox
            </a>
          ) : null}
          <Link to="/operations" className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold text-accent">
            Back to projects
          </Link>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-hairline pb-2">
        <Link
          to={`/operations/${projectId}?tab=dashboard`}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "dashboard" ? "bg-primary text-white" : "border border-hairline text-ink"}`}
        >
          Dashboard
        </Link>
        <Link to={`/operations/${projectId}/schedule`} className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold text-ink">
          Schedule
        </Link>
        <Link to={`/operations/${projectId}/whs`} className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold text-ink">
          WHS
        </Link>
        <Link to={`/operations/${projectId}/diary`} className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold text-ink">
          Diary
        </Link>
        <Link
          to={`/operations/${projectId}?tab=financials`}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "financials" ? "bg-primary text-white" : "border border-hairline text-ink"}`}
        >
          Financials
        </Link>
      </nav>

      {error ? <div className="text-sm text-danger">{error}</div> : null}

      {tab === "dashboard" ? (
        <div className="space-y-6">
          {dashLoading ? <p className="text-sm text-muted">Loading dashboard…</p> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-card border border-hairline bg-surface p-4 shadow-sm">
              <h2 className="text-sm font-bold uppercase text-muted">Today</h2>
              <p className="mt-2 text-lg font-semibold text-ink">{new Date(dash.tday).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
              <p className="mt-2 text-sm text-muted">
                Current phase: <span className="font-semibold text-ink">{dash.currentPhase}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {dash.onSite.length ? dash.onSite.map((tr) => (
                  <span key={tr} className="rounded-full bg-page px-2 py-0.5 text-xs text-muted">
                    {tr}
                  </span>
                )) : (
                  <span className="text-xs text-muted">No trades scheduled today</span>
                )}
              </div>
              <p className="mt-3 text-xs text-muted">
                Next hold point: <span className="font-semibold text-ink">{dash.nextHold}</span>
              </p>
            </div>
            <div className="rounded-card border border-hairline bg-surface p-4 shadow-sm">
              <h2 className="text-sm font-bold uppercase text-muted">Procurement deadlines</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {dash.proc.map((t) => {
                  const d0 = new Date(`${t.order_by_date}T00:00:00`);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const diff = Math.ceil((d0 - today) / 86400000);
                  let cls = "text-accent";
                  if (diff < 0) cls = "text-danger font-semibold";
                  else if (diff < 7) cls = "text-warning font-semibold";
                  return (
                    <li key={t.id} className="border-t border-hairline pt-2">
                      <div className="font-semibold text-ink">{t.name}</div>
                      <div className="text-xs text-muted">
                        {t.trade} · order by {t.order_by_date}{" "}
                        <span className={cls}>({diff < 0 ? `${Math.abs(diff)}d overdue` : `${diff}d`})</span>
                      </div>
                    </li>
                  );
                })}
                {!dash.proc.length ? <li className="text-xs text-muted">None</li> : null}
              </ul>
            </div>
            <div className="rounded-card border border-hairline bg-surface p-4 shadow-sm">
              <h2 className="text-sm font-bold uppercase text-muted">WHS alerts</h2>
              <p className="mt-2 text-sm">
                <span className="text-danger font-semibold">{dash.whsExp}</span> expired docs ·{" "}
                <span className="text-warning font-semibold">{dash.whsSoon}</span> expiring soon
              </p>
              <p className="mt-2 text-sm text-muted">
                Open incidents: <span className="font-semibold text-ink">{dash.openRep}</span>
              </p>
              <Link to={`/operations/${projectId}/whs`} className="mt-3 inline-block text-sm font-semibold text-primary underline">
                Open WHS
              </Link>
            </div>
            <div className="rounded-card border border-hairline bg-surface p-4 shadow-sm">
              <h2 className="text-sm font-bold uppercase text-muted">Schedule health</h2>
              <p className="mt-2 text-sm text-muted">
                {dash.completeN}/{dash.total} complete ({dash.pct}%)
              </p>
              <p className="mt-2 text-sm text-muted">
                Projected end: <span className="font-semibold text-ink">{dash.projected}</span>
              </p>
              <p className="mt-2 text-sm text-muted">
                Tasks with AI flag: <span className="font-semibold text-ink">{dash.aiN}</span>
              </p>
            </div>
          </div>
          <div className="rounded-card border border-hairline bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase text-muted">Recent diary</h2>
              <Link to={`/operations/${projectId}/diary`} className="text-sm font-semibold text-primary underline">
                View all
              </Link>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {diaryPreview.map((en) => (
                <li key={en.id} className="border-t border-hairline pt-2">
                  <span className="font-semibold">{en.entry_date}</span>{" "}
                  <span className="text-xs text-muted">{en.weather || "—"}</span>
                  <div className="text-xs text-muted">{(en.trades_onsite || []).join(", ")}</div>
                  <p className="mt-1 line-clamp-2 text-ink">{String(en.work_completed || "").slice(0, 100)}</p>
                </li>
              ))}
              {!diaryPreview.length ? <li className="text-xs text-muted">No entries yet.</li> : null}
            </ul>
          </div>
        </div>
      ) : null}

      {tab === "financials" ? (
        <div className="space-y-8">
          <div className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
            <div className="flex flex-wrap gap-3">
              <label className="text-xs font-semibold text-muted">
                Tentative start
                <input
                  type="date"
                  defaultValue={project.tentative_start_date || ""}
                  className="ml-2 rounded border border-hairline px-2 py-1 text-sm"
                  onBlur={(e) => saveTentative(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-6 border-t border-hairline pt-4">
              <h2 className="text-sm font-bold text-primary">Buildexact</h2>
              {project.buildexact_job_id ? (
                <p className="mt-2 text-sm text-ink">
                  Job ID: <code className="text-xs">{project.buildexact_job_id}</code>
                  {project.buildexact_last_sync ? (
                    <span className="text-muted"> — last sync {new Date(project.buildexact_last_sync).toLocaleString("en-AU")}</span>
                  ) : null}
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="text-xs font-semibold text-muted">
                    Job ID (manual)
                    <input value={beId} onChange={(e) => setBeId(e.target.value)} className="ml-2 rounded border px-2 py-1 text-sm" />
                  </label>
                  <button type="button" onClick={manualLinkBuildexact} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                    Save link
                  </button>
                  <span className="text-xs text-warning">Waiting for webhook… if job was just created in Buildexact</span>
                </div>
              )}
            </div>
          </div>

          <section>
            <h2 className="text-sm font-bold uppercase text-muted">Accepted trades</h2>
            <div className="mt-3 overflow-x-auto rounded-card border border-hairline">
              <table className="min-w-full text-sm">
                <thead className="bg-page text-left text-xs uppercase text-muted">
                  <tr>
                    <th className="px-3 py-2">Trade</th>
                    <th className="px-3 py-2">Subcontractor</th>
                    <th className="px-3 py-2">Quote</th>
                    <th className="px-3 py-2">PO</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t, i) => (
                    <tr key={i} className="border-t border-hairline">
                      <td className="px-3 py-2 font-semibold">{t.trade}</td>
                      <td className="px-3 py-2">{t.subcontractor || "—"}</td>
                      <td className="px-3 py-2">{t.quote_amount != null ? `$${Number(t.quote_amount).toFixed(2)}` : "—"}</td>
                      <td className="px-3 py-2">
                        {issuedForTrade(t) ? (
                          <span className="text-accent">Issued</span>
                        ) : (
                          <button type="button" className="text-xs font-bold text-primary underline" onClick={() => setPoTrade({ ...t, rfq_id: t.rfq_id })}>
                            Issue PO
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {poTrade ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && setPoTrade(null)}>
          <div className="w-full max-w-md rounded-card border border-hairline bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-primary">Issue PO — {poTrade.trade}</h2>
            <label className="mt-4 block text-xs font-semibold text-muted">
              Scheduled completion
              <input type="date" value={sched} onChange={(e) => setSched(e.target.value)} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
            </label>
            <p className="mt-3 text-xs text-muted">Uses company details from Settings. Sends PDF by email and uploads to Dropbox INTERNAL/P.O when configured.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-2 text-sm text-muted" onClick={() => setPoTrade(null)}>
                Cancel
              </button>
              <button type="button" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white" onClick={issuePo}>
                {busy ? "Working…" : "Generate & send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

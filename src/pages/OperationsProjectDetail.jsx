import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";
import { loadCompanySettings } from "../lib/companySettings.js";
import { formatSignatureFooter, loadEmailSignature } from "../lib/rfqSettings.js";

const PHASE_ORDER = ["pre_construction", "site_prep", "substructure", "frame", "rough_in", "lock_up", "fitout", "completion"];
const PHASE_LABELS = {
  pre_construction: "Pre-construction",
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

function daysDiff(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d - today) / 86400000);
}

function InsightAlert({ level, title, detail, linkTo, linkLabel }) {
  const styles = {
    danger:  "border-danger/30 bg-danger/5 text-danger",
    warning: "border-warning/30 bg-warning/5 text-warning",
    info:    "border-primary/30 bg-primary/5 text-primary",
    success: "border-success/30 bg-success/5 text-success",
  };
  const dotStyles = {
    danger:  "bg-danger",
    warning: "bg-warning",
    info:    "bg-primary",
    success: "bg-success",
  };
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${styles[level]}`}>
      <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${dotStyles[level]}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {detail ? <p className="mt-0.5 text-xs opacity-80">{detail}</p> : null}
      </div>
      {linkTo ? (
        <Link to={linkTo} className="flex-shrink-0 text-xs font-semibold underline opacity-80 hover:opacity-100">
          {linkLabel || "View"}
        </Link>
      ) : null}
    </div>
  );
}

function ModuleCard({ to, title, description, stat, statLabel, icon }) {
  return (
    <Link to={to} className="group block rounded-lg border border-hairline bg-surface p-4 shadow-sm transition hover:border-primary hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="section-label">{title}</p>
          {stat != null ? (
            <p className="mt-1 text-2xl font-bold text-ink">{stat}</p>
          ) : null}
          {statLabel ? <p className="text-xs text-muted">{statLabel}</p> : null}
          {description ? <p className="mt-2 text-sm text-muted">{description}</p> : null}
        </div>
        <span className="text-2xl opacity-40 group-hover:opacity-70">{icon}</span>
      </div>
    </Link>
  );
}

export default function OperationsProjectDetail() {
  const { projectId } = useParams();

  const [project, setProject] = useState(null);
  const [pos, setPos] = useState([]);
  const [error, setError] = useState("");
  const [beId, setBeId] = useState("");
  const [poTrade, setPoTrade] = useState(null);
  const [sched, setSched] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [diaryPreview, setDiaryPreview] = useState([]);
  const [complianceSubs, setComplianceSubs] = useState([]);
  const [reports, setReports] = useState([]);
  const [showFinancials, setShowFinancials] = useState(false);

  const load = useCallback(async () => {
    if (!supabaseConfigured || !projectId) return;
    const sb = getSupabase();
    const { data: p, error: e1 } = await sb
      .from("projects")
      .select(`*, jobs ( id, address, won_at, dropbox_shared_link, dropbox_link, dropbox_internal_path )`)
      .eq("id", projectId)
      .single();
    if (e1) { setError(e1.message); return; }
    setProject(p);
    setBeId(p?.buildexact_job_id || "");
    const { data: po } = await sb.from("purchase_orders").select("*").eq("project_id", projectId);
    setPos(po || []);
  }, [projectId]);

  const loadDashboardData = useCallback(async () => {
    if (!projectId) return;
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
      /* non-fatal */
    }
  }, [projectId]);

  useEffect(() => {
    Promise.all([load(), loadDashboardData()]).finally(() => setLoading(false));
  }, [load, loadDashboardData]);

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
    const { error: u } = await sb.from("projects")
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
          lineItems: [{ description: `${poTrade.trade} — ${poTrade.subcontractor || ""}`.trim(), qty: "1", unit: "lot", unitCost: Number(poTrade.quote_amount) || 0, lineTotal: Number(poTrade.quote_amount) || 0 }],
          company: { companyName: co.companyName, abn: co.abn, address: co.address, phone: co.phone, email: co.email, website: co.website },
          vendor: { businessName: poTrade.subcontractor, contact: poTrade.contact, email: poTrade.email, phone: poTrade.phone || "" },
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

  const insights = useMemo(() => {
    const today = todayIso();
    const alerts = [];

    const overdueProcurement = tasks.filter((t) => t.order_by_date && t.order_by_date < today && t.status !== "complete");
    if (overdueProcurement.length > 0) {
      const names = overdueProcurement.map((t) => t.name).slice(0, 2).join(", ");
      alerts.push({ level: "danger", title: `${overdueProcurement.length} procurement order${overdueProcurement.length > 1 ? "s" : ""} overdue`, detail: names + (overdueProcurement.length > 2 ? ` +${overdueProcurement.length - 2} more` : ""), linkTo: `/operations/${projectId}/schedule`, linkLabel: "Schedule" });
    }

    const urgentProcurement = tasks.filter((t) => t.order_by_date && t.order_by_date >= today && daysDiff(t.order_by_date) <= 7 && t.status !== "complete");
    if (urgentProcurement.length > 0) {
      const next = urgentProcurement.sort((a, b) => a.order_by_date.localeCompare(b.order_by_date))[0];
      alerts.push({ level: "warning", title: `Order deadline in ${daysDiff(next.order_by_date)}d — ${next.name}`, detail: `${urgentProcurement.length} procurement task${urgentProcurement.length > 1 ? "s" : ""} due within 7 days`, linkTo: `/operations/${projectId}/schedule`, linkLabel: "Schedule" });
    }

    let whsExp = 0, whsSoon = 0;
    for (const s of complianceSubs) {
      for (const d of s.documents || []) {
        const st = d.computed_status || d.status;
        if (st === "expired") whsExp++;
        else if (st === "expiring_soon") whsSoon++;
      }
    }
    if (whsExp > 0) {
      alerts.push({ level: "danger", title: `${whsExp} compliance document${whsExp > 1 ? "s" : ""} expired`, detail: "Subcontractor compliance requires attention", linkTo: `/operations/${projectId}/whs`, linkLabel: "WHS" });
    }
    if (whsSoon > 0) {
      alerts.push({ level: "warning", title: `${whsSoon} compliance document${whsSoon > 1 ? "s" : ""} expiring soon`, detail: "Review before trades return to site", linkTo: `/operations/${projectId}/whs`, linkLabel: "WHS" });
    }

    const openIncidents = reports.filter((r) => r.status === "open" || r.status === "in_progress").length;
    if (openIncidents > 0) {
      alerts.push({ level: "warning", title: `${openIncidents} open WHS incident${openIncidents > 1 ? "s" : ""}`, linkTo: `/operations/${projectId}/whs`, linkLabel: "WHS" });
    }

    const upcomingHolds = tasks.filter((t) => (t.is_hold_point || t.task_type === "inspection" || t.task_type === "approval") && t.status !== "complete" && t.start_date && daysDiff(t.start_date) <= 5 && daysDiff(t.start_date) >= 0);
    if (upcomingHolds.length > 0) {
      const next = upcomingHolds.sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
      alerts.push({ level: "info", title: `Hold point in ${daysDiff(next.start_date)}d — ${next.name}`, detail: "Inspection / approval required", linkTo: `/operations/${projectId}/schedule`, linkLabel: "Schedule" });
    }

    const overdueTasks = tasks.filter((t) => t.end_date && t.end_date < today && t.status !== "complete");
    if (overdueTasks.length > 3) {
      alerts.push({ level: "warning", title: `${overdueTasks.length} tasks past their end date`, detail: "Schedule may need rebaselining", linkTo: `/operations/${projectId}/schedule`, linkLabel: "Schedule" });
    }

    const OUTDOOR_PHASES = new Set(["site_prep", "site_slab", "substructure", "frame", "roofing", "roof", "lock_up"]);
    const OUTDOOR_TRADES = new Set(["framing", "roofing", "concreting", "excavation", "bricklaying", "external cladding", "rendering"]);
    const thisWeek = new Date(); thisWeek.setDate(thisWeek.getDate() + 7);
    const thisWeekStr = thisWeek.toISOString().slice(0, 10);
    const outdoorThisWeek = tasks.filter((t) => {
      const phase = (t.phase || "").toLowerCase();
      const trade = (t.assignee_trade || t.trade || "").toLowerCase();
      return (OUTDOOR_PHASES.has(phase) || OUTDOOR_TRADES.has(trade)) && t.status !== "complete" && t.start_date && t.start_date <= thisWeekStr && t.end_date && t.end_date >= today;
    });
    if (outdoorThisWeek.length > 0) {
      alerts.push({ level: "info", title: `${outdoorThisWeek.length} outdoor task${outdoorThisWeek.length !== 1 ? "s" : ""} scheduled this week`, detail: "Check BOM forecast — rain may affect frame, roofing and external works" });
    }

    const idleLabour = tasks.filter((t) => t.start_date && t.start_date < today && t.status === "in_progress" && (t.percent_complete || 0) === 0);
    if (idleLabour.length > 0) {
      alerts.push({ level: "warning", title: `${idleLabour.length} in-progress task${idleLabour.length !== 1 ? "s" : ""} with no logged progress`, detail: "Possible idle labour — update task completion or status", linkTo: `/operations/${projectId}/schedule`, linkLabel: "Schedule" });
    }

    if (alerts.length === 0) {
      alerts.push({ level: "success", title: "No active alerts", detail: "Schedule, procurement and compliance look good" });
    }

    return alerts;
  }, [tasks, complianceSubs, reports, projectId]);

  const summary = useMemo(() => {
    const today = todayIso();
    const active = tasks.filter((t) => t.status !== "complete");
    let currentPhase = null;
    for (const ph of PHASE_ORDER) {
      if (active.some((t) => t.phase === ph)) { currentPhase = PHASE_LABELS[ph] || ph; break; }
    }
    const total = tasks.length;
    const completeN = tasks.filter((t) => t.status === "complete").length;
    const pct = total ? Math.round((completeN / total) * 100) : 0;
    const incomplete = tasks.filter((t) => t.status !== "complete" && t.end_date);
    const projected = incomplete.length === 0 ? null : incomplete.reduce((mx, t) => (t.end_date > mx ? t.end_date : mx), incomplete[0].end_date);
    const todayTasks = tasks.filter((t) => t.start_date && t.end_date && t.start_date <= today && t.end_date >= today && t.status !== "complete");
    const nextMilestone = tasks.filter((t) => (t.task_type === "milestone" || t.is_hold_point) && t.status !== "complete" && t.start_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
    return { currentPhase, total, completeN, pct, projected, todayTasks, nextMilestone };
  }, [tasks]);

  if (loading && !project) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  if (!project) {
    return (
      <p className="text-sm text-muted">
        {error || "Project not found."}{" "}
        <Link to="/operations" className="font-semibold text-accent underline">Back</Link>
      </p>
    );
  }

  const trades = Array.isArray(project.accepted_trades) ? project.accepted_trades : [];
  const drop = String(project.dropbox_shared_link || project.jobs?.dropbox_shared_link || project.jobs?.dropbox_link || "").trim();
  const issuedForTrade = (t) => pos.some((p) => p.trade === t.trade && p.status === "issued");

  return (
    <div className="space-y-5 pb-24">

      {/* ── Header ── */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline pb-5 pt-1">
        <div className="min-w-0">
          <Link to="/operations" className="text-xs font-semibold text-muted hover:text-primary">← Projects</Link>
          <h1 className="mt-1 page-title">{project.address}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {summary.currentPhase ? (
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{summary.currentPhase}</span>
            ) : null}
            {summary.pct > 0 ? (
              <span className="text-xs text-muted">{summary.pct}% complete</span>
            ) : null}
            {summary.projected ? (
              <span className="text-xs text-muted">· ETA {summary.projected}</span>
            ) : null}
            {project.tentative_start_date && !summary.total ? (
              <span className="text-xs text-muted">Tentative start {project.tentative_start_date}</span>
            ) : null}
          </div>
          {summary.pct > 0 ? (
            <div className="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-hairline">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${summary.pct}%` }} />
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {project.portal_token && project.portal_enabled ? (
            <a
              href={`/portal/${project.portal_token}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary hover:text-white"
            >
              View as client
            </a>
          ) : null}
          {drop ? (
            <a href={drop} target="_blank" rel="noreferrer" className="rounded-lg border border-hairline px-3 py-1.5 text-sm font-semibold text-primary hover:bg-page">
              Dropbox
            </a>
          ) : null}
        </div>
      </header>

      {error ? <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger">{error}</div> : null}

      {/* ── Insights Panel ── */}
      <section>
        <h2 className="mb-2 section-label">Insights</h2>
        <div className="space-y-2">
          {insights.map((alert, i) => (
            <InsightAlert key={i} {...alert} />
          ))}
        </div>
      </section>

      {/* ── Schedule snapshot ── */}
      {summary.total > 0 ? (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="section-label">Schedule</h2>
            <Link to={`/operations/${projectId}/schedule`} className="text-xs font-semibold text-primary hover:underline">
              Open full schedule →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-hairline bg-surface p-3">
              <p className="text-xs text-muted">Today on site</p>
              <p className="mt-1 text-lg font-bold text-ink">{summary.todayTasks.length}</p>
              <p className="text-xs text-muted truncate">{summary.todayTasks.map((t) => t.trade).filter(Boolean).join(", ") || "No trades"}</p>
            </div>
            <div className="rounded-lg border border-hairline bg-surface p-3">
              <p className="text-xs text-muted">Complete</p>
              <p className="mt-1 text-lg font-bold text-ink">{summary.completeN}/{summary.total}</p>
              <p className="text-xs text-muted">{summary.pct}%</p>
            </div>
            <div className="rounded-lg border border-hairline bg-surface p-3">
              <p className="text-xs text-muted">Next milestone</p>
              <p className="mt-1 text-sm font-semibold text-ink leading-snug">{summary.nextMilestone?.name || "—"}</p>
              {summary.nextMilestone?.start_date ? <p className="text-xs text-muted">{summary.nextMilestone.start_date}</p> : null}
            </div>
            <div className="rounded-lg border border-hairline bg-surface p-3">
              <p className="text-xs text-muted">Projected end</p>
              <p className="mt-1 text-sm font-semibold text-ink">{summary.projected || "—"}</p>
            </div>
          </div>
        </section>
      ) : (
        <section>
          <div className="rounded-lg border border-hairline bg-surface p-4 text-center">
            <p className="text-sm text-muted">No schedule yet</p>
            <Link to={`/operations/${projectId}/schedule`} className="mt-2 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">
              Generate schedule
            </Link>
          </div>
        </section>
      )}

      {/* ── Module cards ── */}
      <section>
        <h2 className="mb-2 section-label">Manage</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <ModuleCard
            to={`/operations/${projectId}/schedule`}
            title="Schedule"
            stat={summary.total || null}
            statLabel={summary.total ? "tasks" : null}
            description={!summary.total ? "Generate or load a schedule" : null}
            icon="📅"
          />
          <ModuleCard
            to={`/operations/${projectId}/whs`}
            title="WHS"
            stat={null}
            description="Safety checklists, compliance &amp; incidents"
            icon="🦺"
          />
          <ModuleCard
            to={`/operations/${projectId}/diary`}
            title="Site Diary"
            stat={diaryPreview.length > 0 ? diaryPreview.length : null}
            statLabel={diaryPreview.length > 0 ? "recent entries" : null}
            description={!diaryPreview.length ? "Record daily site activities" : null}
            icon="📋"
          />
        </div>
      </section>

      {/* ── Recent diary ── */}
      {diaryPreview.length > 0 ? (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="section-label">Recent diary</h2>
            <Link to={`/operations/${projectId}/diary`} className="text-xs font-semibold text-primary hover:underline">View all →</Link>
          </div>
          <div className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
            {diaryPreview.map((en) => (
              <div key={en.id} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{en.entry_date}</span>
                  <span className="text-xs text-muted">{en.weather || ""}</span>
                  <span className="text-xs text-muted">{(en.trades_onsite || []).join(", ")}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{String(en.work_completed || "").slice(0, 120)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Financials (collapsible) ── */}
      <section>
        <button
          type="button"
          onClick={() => setShowFinancials((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-hairline bg-surface px-4 py-3 text-left"
        >
          <h2 className="section-label">Financials &amp; POs</h2>
          <span className="text-xs text-muted">{showFinancials ? "Hide ▲" : "Show ▼"}</span>
        </button>
        {showFinancials ? (
          <div className="mt-2 space-y-5 rounded-lg border border-hairline bg-surface p-4">
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
            <div className="border-t border-hairline pt-4">
              <h3 className="text-xs font-bold text-muted uppercase">Buildexact</h3>
              {project.buildexact_job_id ? (
                <p className="mt-2 text-sm text-ink">
                  Job ID: <code className="text-xs">{project.buildexact_job_id}</code>
                  {project.buildexact_last_sync ? <span className="text-muted"> — last sync {new Date(project.buildexact_last_sync).toLocaleString("en-AU")}</span> : null}
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="text-xs font-semibold text-muted">
                    Job ID (manual)
                    <input value={beId} onChange={(e) => setBeId(e.target.value)} className="ml-2 rounded border px-2 py-1 text-sm" />
                  </label>
                  <button type="button" onClick={manualLinkBuildexact} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">Save link</button>
                  <span className="text-xs text-warning">Waiting for webhook…</span>
                </div>
              )}
            </div>
            {trades.length > 0 ? (
              <div className="border-t border-hairline pt-4">
                <h3 className="mb-2 text-xs font-bold uppercase text-muted">Accepted trades</h3>
                <div className="overflow-x-auto rounded-lg border border-hairline">
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
                              <button type="button" className="text-xs font-bold text-primary underline" onClick={() => setPoTrade({ ...t })}>Issue PO</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ── Issue PO modal ── */}
      {poTrade ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && setPoTrade(null)}>
          <div className="w-full max-w-md rounded-card border border-hairline bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-primary">Issue PO — {poTrade.trade}</h2>
            <label className="mt-4 block text-xs font-semibold text-muted">
              Scheduled completion
              <input type="date" value={sched} onChange={(e) => setSched(e.target.value)} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
            </label>
            <p className="mt-3 text-xs text-muted">Uses company details from Settings. Sends PDF by email and uploads to Dropbox.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-2 text-sm text-muted" onClick={() => setPoTrade(null)}>Cancel</button>
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

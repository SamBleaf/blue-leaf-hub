import { authFetch } from "../lib/authFetch.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";
import { useProject } from "../lib/ProjectContext.jsx";
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
  const { selectProject } = useProject();

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
  const [tradesData, setTradesData] = useState(null); // null = not loaded
  const [tradesLoading, setTradesLoading] = useState(false);
  const [showTradesTab, setShowTradesTab] = useState(false);
  const [commencementDate, setCommencementDate] = useState("");
  const [expandedTradeId, setExpandedTradeId] = useState(null);
  const [taskActionBusy, setTaskActionBusy] = useState({});
  const [taskUnsureId, setTaskUnsureId] = useState(null);
  const [taskUnsureNote, setTaskUnsureNote] = useState("");
  const [supervisorTasks, setSupervisorTasks] = useState([]);
  const [showLabourTab, setShowLabourTab] = useState(false);
  const [labourData, setLabourData] = useState(null);
  const [labourLoading, setLabourLoading] = useState(false);
  const [showSiteTasksTab, setShowSiteTasksTab] = useState(false);
  const [siteTasks, setSiteTasks] = useState([]);
  const [siteTasksLoading, setSiteTasksLoading] = useState(false);
  const [siteTaskFilter, setSiteTaskFilter] = useState("All");
  const [newTaskForm, setNewTaskForm] = useState(null); // null | {}
  const [newTaskBusy, setNewTaskBusy] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState("");
  const [employees, setEmployees] = useState([]);
  const siteTaskFormRef = useRef(null);

  const load = useCallback(async () => {
    if (!supabaseConfigured || !projectId) return;
    const sb = getSupabase();
    const { data: p, error: e1 } = await sb
      .from("projects")
      .select(`*, jobs ( id, address, won_at, dropbox_shared_link, dropbox_link, dropbox_internal_path )`)
      .eq("id", projectId)
      .single();
    // A bad/stale projectId yields a raw Postgres error ("invalid input syntax for type uuid",
    // "Cannot coerce the result to a single JSON object"). Show a friendly not-found instead of
    // leaking the DB string (CLAUDE.md).
    if (e1) {
      const raw = e1.message || "";
      const notFound = /invalid input syntax|coerce the result|0 rows|JSON object/i.test(raw);
      setError(notFound ? "Project not found." : "Couldn't load this project. Please try again.");
      return;
    }
    setProject(p);
    if (p) selectProject({ id: p.id, address: p.address, status: p.status ?? null, job_id: p.job_id ?? null });
    setBeId(p?.buildexact_job_id || "");
    const { data: po } = await sb.from("purchase_orders").select("*").eq("project_id", projectId);
    setPos(po || []);
  }, [projectId, selectProject]);

  const loadDashboardData = useCallback(async () => {
    if (!projectId) return;
    try {
      const [ts, di, co, rep] = await Promise.all([
        authFetch(`/api/schedule/${projectId}`).then((r) => r.json()),
        authFetch(`/api/diary/${projectId}?limit=3`).then((r) => r.json()),
        authFetch(`/api/whs/${projectId}/compliance`).then((r) => r.json()),
        authFetch(`/api/whs/${projectId}/reports`).then((r) => r.json())
      ]);
      setTasks(ts.ok ? ts.tasks || [] : []);
      setDiaryPreview(di.ok ? di.entries || [] : []);
      setComplianceSubs(co.ok ? co.subcontractors || [] : []);
      setReports(rep.ok ? rep.reports || [] : []);
    } catch {
      /* non-fatal */
    }
  }, [projectId]);

  const loadTrades = useCallback(async () => {
    if (!projectId) return;
    setTradesLoading(true);
    try {
      const [tradesRes, tasksRes] = await Promise.all([
        authFetch(`/api/projects/${projectId}/trades`),
        authFetch(`/api/projects/${projectId}/supervisor-tasks`),
      ]);
      const j = await tradesRes.json();
      const tj = await tasksRes.json();
      if (j.ok) {
        setTradesData(j);
        setCommencementDate(j.commencement_date || "");
      }
      if (tj.ok) setSupervisorTasks(tj.tasks || []);
    } catch { /* non-fatal */ }
    finally { setTradesLoading(false); }
  }, [projectId]);

  useEffect(() => {
    Promise.all([load(), loadDashboardData()]).finally(() => setLoading(false));
  }, [load, loadDashboardData]);

  useEffect(() => {
    if (showTradesTab) loadTrades();
  }, [showTradesTab, loadTrades]);

  const loadLabour = useCallback(async () => {
    if (!projectId) return;
    setLabourLoading(true);
    try {
      const res = await authFetch(`/api/projects/${projectId}/labour`);
      const j = await res.json();
      if (j.ok) setLabourData(j);
    } catch { /* non-fatal */ } finally { setLabourLoading(false); }
  }, [projectId]);

  useEffect(() => { if (showLabourTab) loadLabour(); }, [showLabourTab, loadLabour]);

  const loadSiteTasks = useCallback(async () => {
    if (!projectId) return;
    setSiteTasksLoading(true);
    try {
      const res = await authFetch(`/api/projects/${projectId}/site-tasks`);
      const j = await res.json();
      if (j.ok) setSiteTasks(j.tasks || []);
    } catch { /* non-fatal */ } finally { setSiteTasksLoading(false); }
  }, [projectId]);

  useEffect(() => {
    if (showSiteTasksTab) {
      loadSiteTasks();
      authFetch("/api/workforce/employees").then(r => r.json()).then(j => { if (j.ok) setEmployees(j.employees || []); }).catch(() => {});
    }
  }, [showSiteTasksTab, loadSiteTasks]);

  async function createSiteTask(form) {
    setNewTaskBusy(true);
    try {
      await authFetch(`/api/projects/${projectId}/site-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setNewTaskForm(null);
      loadSiteTasks();
    } catch (e) { setError(e?.message || String(e)); } finally { setNewTaskBusy(false); }
  }

  async function handleQuickAddTask(e) {
    if (e.key !== "Enter") return;
    const title = quickTaskTitle.trim();
    if (!title || newTaskBusy) return;
    setQuickTaskTitle("");
    await createSiteTask({ title, priority: "normal", category: "general" });
  }

  async function completeSiteTask(taskId) {
    await authFetch(`/api/site-tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    setSiteTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: "done", completed_at: new Date().toISOString() } : t));
  }

  async function saveCommencementDate(isoDate) {
    try {
      await authFetch(`/api/projects/${projectId}/commencement`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commencement_date: isoDate || null })
      });
      setCommencementDate(isoDate);
    } catch (e) { setError(e?.message || String(e)); }
  }

  async function markResponded(task, poId) {
    setTaskActionBusy(prev => ({ ...prev, [task.id]: true }));
    try {
      await authFetch(`/api/supervisor-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" })
      });
      await authFetch("/api/trade-communication/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchase_order_id: poId, response_status: "responded" })
      });
      loadTrades();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setTaskActionBusy(prev => ({ ...prev, [task.id]: false })); }
  }

  async function markGhosted(task, poId) {
    setTaskActionBusy(prev => ({ ...prev, [task.id]: "ghosted" }));
    try {
      await authFetch(`/api/supervisor-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" })
      });
      await authFetch("/api/trade-communication/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchase_order_id: poId, response_status: "ghosted" })
      });
      loadTrades();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setTaskActionBusy(prev => ({ ...prev, [task.id]: false })); }
  }

  async function markUnavailable(task, poId) {
    setTaskActionBusy(prev => ({ ...prev, [task.id]: "unavailable" }));
    try {
      await authFetch(`/api/supervisor-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" })
      });
      await authFetch("/api/trade-communication/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchase_order_id: poId, response_status: "unavailable" })
      });
      loadTrades();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setTaskActionBusy(prev => ({ ...prev, [task.id]: false })); }
  }

  async function snoozeTask(task, note) {
    setTaskActionBusy(prev => ({ ...prev, [task.id]: "snooze" }));
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    try {
      const desc = note ? `${task.description || ""}\n\nNote: ${note}`.trim() : task.description;
      await authFetch(`/api/supervisor-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ due_date: dueDate.toISOString().slice(0, 10), description: desc })
      });
      setTaskUnsureId(null);
      setTaskUnsureNote("");
      loadTrades();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setTaskActionBusy(prev => ({ ...prev, [task.id]: false })); }
  }

  async function completeSupervisorTask(taskId) {
    setTaskActionBusy(prev => ({ ...prev, [taskId]: "done" }));
    try {
      await authFetch(`/api/supervisor-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" })
      });
      loadTrades();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setTaskActionBusy(prev => ({ ...prev, [taskId]: false })); }
  }

  async function dismissSupervisorTask(taskId) {
    setTaskActionBusy(prev => ({ ...prev, [taskId]: "dismiss" }));
    try {
      await authFetch(`/api/supervisor-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" })
      });
      loadTrades();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setTaskActionBusy(prev => ({ ...prev, [taskId]: false })); }
  }

  async function markTradeResponded(poId) {
    try {
      await authFetch("/api/trade-communication/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchase_order_id: poId, response_status: "responded" })
      });
      loadTrades();
    } catch (e) { setError(e?.message || String(e)); }
  }

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
      const res = await authFetch("/api/po/issue", {
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

      {/* ── Trades tab (collapsible) ── */}
      <section>
        <button
          type="button"
          onClick={() => setShowTradesTab(v => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-hairline bg-surface px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <h2 className="section-label">Trades</h2>
            {supervisorTasks.length > 0 && (
              <span className="rounded-full bg-warning px-2 py-0.5 text-[10px] font-bold text-white">
                {supervisorTasks.length}
              </span>
            )}
          </div>
          <span className="text-xs text-muted">{showTradesTab ? "Hide ▲" : "Show ▼"}</span>
        </button>
        {showTradesTab ? (
          <div className="mt-2 space-y-4 rounded-lg border border-hairline bg-surface p-4">

            {/* ── Supervisor Actions panel ── */}
            {supervisorTasks.length > 0 && (() => {
              const today = new Date().toISOString().slice(0, 10);
              const TASK_ICONS = {
                call_trade_schedule_change: { icon: "⚠", cls: "border-warning/40 bg-warning/5" },
                call_trade_no_response: { icon: "📞", cls: "border-primary/30 bg-primary/5" },
                find_backup_trade: { icon: "🔴", cls: "border-danger/30 bg-danger/5" },
                follow_up_trade: { icon: "📋", cls: "border-hairline bg-page" },
              };
              return (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">
                    Supervisor Actions <span className="text-warning">({supervisorTasks.length} open)</span>
                  </p>
                  <div className="space-y-2">
                    {supervisorTasks.map(task => {
                      const style = TASK_ICONS[task.task_type] || TASK_ICONS.follow_up_trade;
                      const isOverdue = task.due_date && task.due_date < today;
                      const sub = task.subcontractors || {};
                      const busy = taskActionBusy[task.id];

                      const dueLabel = (() => {
                        if (!task.due_date) return null;
                        if (isOverdue) {
                          const daysAgo = Math.ceil((new Date(today) - new Date(`${task.due_date}T00:00:00`)) / 86400000);
                          return <span className="text-danger font-semibold">{daysAgo === 1 ? "1 day ago" : `${daysAgo} days ago`} (overdue)</span>;
                        }
                        const diff = Math.ceil((new Date(`${task.due_date}T00:00:00`) - new Date(today)) / 86400000);
                        if (diff === 0) return "today";
                        if (diff === 1) return "tomorrow";
                        return `in ${diff} days`;
                      })();

                      return (
                        <div
                          key={task.id}
                          className={`rounded-lg border px-4 py-3 ${style.cls} ${isOverdue ? "border-danger/40" : ""}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-ink">
                                {style.icon} {task.title}
                              </p>
                              {task.description && (
                                <p className="mt-0.5 text-xs text-muted whitespace-pre-line">{task.description}</p>
                              )}
                              {sub.phone && (
                                <p className="mt-0.5 text-xs text-ink">Contact: {sub.phone}</p>
                              )}
                            </div>
                            {dueLabel && (
                              <span className="flex-shrink-0 text-xs text-muted">{dueLabel}</span>
                            )}
                          </div>
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => completeSupervisorTask(task.id)}
                              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {busy === "done" ? "…" : "Done"}
                            </button>
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => dismissSupervisorTask(task.id)}
                              className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-muted hover:text-ink disabled:opacity-50"
                            >
                              {busy === "dismiss" ? "…" : "Dismiss"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <hr className="my-4 border-hairline" />
                </div>
              );
            })()}

            {/* Commencement date */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-muted">
                Commencement date
              </label>
              <input
                type="date"
                value={commencementDate}
                className="rounded border border-hairline px-2 py-1 text-sm"
                onChange={e => setCommencementDate(e.target.value)}
                onBlur={e => saveCommencementDate(e.target.value)}
              />
            </div>

            {tradesLoading ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : !tradesData?.trades?.length ? (
              <p className="text-sm text-muted">No accepted trades yet. Issue POs from the Tender Manager.</p>
            ) : (
              <div className="space-y-3">
                {tradesData.trades.map((trade, idx) => {
                  // Supervisor tasks for this PO
                  const noResponseTasks = (trade.supervisor_tasks || []).filter(t => t.task_type === "call_trade_no_response");

                  const statusCls = trade.is_ghosting && !trade.response_received_at
                    ? "text-warning font-semibold"
                    : trade.response_received_at
                    ? "text-green-600"
                    : trade.status_label === "PO not issued"
                    ? "text-muted"
                    : "text-ink";

                  const rowKey = trade.id || `nopo-${idx}`;
                  const isExpanded = expandedTradeId === rowKey;

                  return (
                    <div key={rowKey} className="rounded-lg border border-hairline bg-page">
                      {/* Supervisor task action cards */}
                      {noResponseTasks.map(task => (
                        <div key={task.id} className="rounded-t-lg border-b border-warning/30 bg-warning/5 px-4 py-3">
                          <p className="text-sm font-semibold text-warning">Action required</p>
                          <p className="text-sm text-ink mt-0.5">{task.title}</p>
                          {trade.subcontractor?.phone && (
                            <p className="text-xs text-muted mt-0.5">Contact: {trade.subcontractor.phone}</p>
                          )}
                          {task.due_date && (
                            <p className="text-xs text-muted">Due: {task.due_date}</p>
                          )}
                          {taskUnsureId === task.id ? (
                            <div className="mt-2 space-y-2">
                              <input
                                type="text"
                                placeholder="Note (optional)"
                                value={taskUnsureNote}
                                onChange={e => setTaskUnsureNote(e.target.value)}
                                className="w-full rounded border border-hairline px-3 py-1.5 text-sm"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={!!taskActionBusy[task.id]}
                                  onClick={() => snoozeTask(task, taskUnsureNote)}
                                  className="rounded-lg bg-warning px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                                >
                                  {taskActionBusy[task.id] ? "Saving…" : "Confirm — try again in 7 days"}
                                </button>
                                <button type="button" onClick={() => { setTaskUnsureId(null); setTaskUnsureNote(""); }} className="text-xs text-muted hover:text-ink">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={!!taskActionBusy[task.id]}
                                onClick={() => markResponded(task, trade.id)}
                                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                {taskActionBusy[task.id] === true ? "…" : "✅ Responded"}
                              </button>
                              <button
                                type="button"
                                disabled={!!taskActionBusy[task.id]}
                                onClick={() => setTaskUnsureId(task.id)}
                                className="rounded-lg border border-warning bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning disabled:opacity-50"
                              >
                                ⏸ Unsure
                              </button>
                              <button
                                type="button"
                                disabled={!!taskActionBusy[task.id]}
                                onClick={() => markGhosted(task, trade.id)}
                                className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-1.5 text-xs font-semibold text-danger disabled:opacity-50"
                              >
                                {taskActionBusy[task.id] === "ghosted" ? "…" : "🔴 Ghosted"}
                              </button>
                              <button
                                type="button"
                                disabled={!!taskActionBusy[task.id]}
                                onClick={() => markUnavailable(task, trade.id)}
                                className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-muted disabled:opacity-50"
                              >
                                {taskActionBusy[task.id] === "unavailable" ? "…" : "Can't make it"}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Trade row */}
                      <button
                        type="button"
                        onClick={() => setExpandedTradeId(isExpanded ? null : rowKey)}
                        className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-hairline/30 rounded-b-lg"
                      >
                        <div className="w-32 flex-shrink-0">
                          <p className="text-sm font-semibold text-ink">{trade.trade}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-ink truncate">{trade.subcontractor?.business_name || "—"}</p>
                          <p className="text-xs text-muted truncate">{trade.subcontractor?.phone || ""}</p>
                        </div>
                        <div className="w-24 flex-shrink-0 text-center">
                          <p className="text-xs font-mono text-muted">{trade.po_number || "—"}</p>
                        </div>
                        <div className="w-28 flex-shrink-0 text-center">
                          <p className="text-xs text-muted">
                            {trade.last_contact_at
                              ? `${trade.days_since_contact}d ago`
                              : "—"}
                          </p>
                        </div>
                        <div className="w-48 flex-shrink-0 text-right">
                          <p className={`text-xs ${statusCls}`}>
                            {trade.is_ghosting && !trade.response_received_at
                              ? `⚠ No response (${trade.days_since_contact}d)`
                              : trade.status_label}
                          </p>
                        </div>
                        <span className="text-xs text-muted">{isExpanded ? "▲" : "▼"}</span>
                      </button>

                      {/* Expanded log */}
                      {isExpanded ? (
                        <div className="border-t border-hairline px-4 pb-4 pt-3 space-y-2">
                          {!trade.id ? (
                            <p className="text-xs text-muted">No PO issued yet.</p>
                          ) : trade.log.length === 0 ? (
                            <p className="text-xs text-muted">No communication logged yet.</p>
                          ) : (
                            <div className="space-y-1">
                              {trade.log.map(ev => (
                                <div key={ev.id} className="flex items-start gap-3 text-xs">
                                  <span className="w-36 flex-shrink-0 text-muted">{new Date(ev.sent_at).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span>
                                  <span className="text-ink capitalize">{ev.event_type.replace(/_/g, " ")}</span>
                                  {ev.email_subject ? <span className="text-muted truncate">— {ev.email_subject}</span> : null}
                                </div>
                              ))}
                            </div>
                          )}
                          {trade.id && !trade.response_received_at && (
                            <button
                              type="button"
                              onClick={() => markTradeResponded(trade.id)}
                              className="mt-2 rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-ink hover:bg-hairline"
                            >
                              Mark responded
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </section>

      {/* ── Labour (collapsible) ── */}
      <section>
        <button
          type="button"
          onClick={() => setShowLabourTab(v => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-hairline bg-surface px-4 py-3 text-left"
        >
          <h2 className="section-label">Labour</h2>
          <span className="text-xs text-muted">{showLabourTab ? "Hide ▲" : "Show ▼"}</span>
        </button>
        {showLabourTab && (
          <div className="mt-2 rounded-lg border border-hairline bg-surface p-4">
            {labourLoading ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : !labourData ? (
              <p className="text-sm text-muted">No labour data</p>
            ) : (
              <div className="space-y-3">
                {labourData.entries_by_category?.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-hairline">
                          <th className="py-2 text-left text-xs font-semibold text-muted">Category</th>
                          <th className="py-2 text-right text-xs font-semibold text-muted">Hours</th>
                          <th className="py-2 pr-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {labourData.entries_by_category.map(cat => (
                          <tr key={cat.task_category}>
                            <td className="py-2 text-ink font-medium">{cat.label}</td>
                            <td className="py-2 text-right text-muted">{cat.total_hours}h</td>
                            <td className="py-2 pr-3 w-32">
                              <div className="h-1.5 rounded-full bg-hairline overflow-hidden">
                                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(cat.total_hours / 200 * 100, 100)}%` }} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex items-center gap-4 pt-1 border-t border-hairline text-sm">
                  <div>
                    <p className="text-xs text-muted">Total hours</p>
                    <p className="font-bold text-ink">{labourData.total_hours}h</p>
                  </div>
                  {labourData.workers_this_week?.length > 0 && (
                    <div>
                      <p className="text-xs text-muted">Active this week</p>
                      <p className="text-ink">{labourData.workers_this_week.map(w => w.name).join(" · ")}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Site Tasks (collapsible) ── */}
      <section>
        <button
          type="button"
          onClick={() => setShowSiteTasksTab(v => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-hairline bg-surface px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <h2 className="section-label">Site Tasks</h2>
            {siteTasks.filter(t => t.status !== "done" && t.status !== "wont_do").length > 0 && (
              <span className="rounded-full bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5">
                {siteTasks.filter(t => t.status !== "done" && t.status !== "wont_do").length}
              </span>
            )}
          </div>
          <span className="text-xs text-muted">{showSiteTasksTab ? "Hide ▲" : "Show ▼"}</span>
        </button>
        {showSiteTasksTab && (
          <div className="mt-2 rounded-lg border border-hairline bg-surface p-4 space-y-3">
            {/* Filter + add */}
            <div className="flex items-center gap-2 flex-wrap">
              {["All", "Urgent", "Defects", "Done"].map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setSiteTaskFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition ${siteTaskFilter === f ? "bg-primary text-white" : "bg-page border border-hairline text-ink"}`}
                >
                  {f}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setNewTaskForm({ title: "", description: "", priority: "normal", category: "general", assigned_to: "" })}
                className="ml-auto text-xs font-semibold text-primary hover:underline"
              >
                + Add task
              </button>
            </div>

            {/* Quick-add bar — always visible */}
            <input
              type="text"
              placeholder="Add a task… (press Enter)"
              value={quickTaskTitle}
              onChange={e => setQuickTaskTitle(e.target.value)}
              onKeyDown={handleQuickAddTask}
              disabled={newTaskBusy}
              className="w-full rounded border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            />

            {/* New task form */}
            {newTaskForm && (
              <div ref={siteTaskFormRef} className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <input
                  type="text"
                  placeholder="Task title *"
                  value={newTaskForm.title}
                  onChange={e => setNewTaskForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full rounded border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={newTaskForm.description}
                  onChange={e => setNewTaskForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full rounded border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <div className="flex gap-2 flex-wrap">
                  <select value={newTaskForm.priority} onChange={e => setNewTaskForm(f => ({ ...f, priority: e.target.value }))} className="border border-hairline rounded px-2 py-1.5 text-xs">
                    <option value="urgent">Urgent</option>
                    <option value="normal">Normal</option>
                    <option value="when_time_permits">When time permits</option>
                  </select>
                  <select value={newTaskForm.category} onChange={e => setNewTaskForm(f => ({ ...f, category: e.target.value }))} className="border border-hairline rounded px-2 py-1.5 text-xs">
                    <option value="general">General</option>
                    <option value="defect">Defect</option>
                    <option value="safety">Safety</option>
                    <option value="materials">Materials</option>
                    <option value="inspection">Inspection</option>
                  </select>
                  <select value={newTaskForm.assigned_to} onChange={e => setNewTaskForm(f => ({ ...f, assigned_to: e.target.value }))} className="border border-hairline rounded px-2 py-1.5 text-xs">
                    <option value="">Unassigned</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={newTaskBusy || !newTaskForm.title.trim()} onClick={() => createSiteTask({ title: newTaskForm.title, description: newTaskForm.description, priority: newTaskForm.priority, category: newTaskForm.category, assigned_to: newTaskForm.assigned_to || undefined })} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50">
                    {newTaskBusy ? "Saving…" : "Add task"}
                  </button>
                  <button type="button" onClick={() => setNewTaskForm(null)} className="text-xs text-muted">Cancel</button>
                </div>
              </div>
            )}

            {siteTasksLoading ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : (
              (() => {
                const PRIORITY_DOT = { urgent: "bg-red-500", normal: "bg-gray-400", when_time_permits: "bg-transparent border border-gray-400 rounded-full" };
                const filtered = siteTasks.filter(t => {
                  if (siteTaskFilter === "Done") return t.status === "done";
                  if (siteTaskFilter === "Urgent") return t.priority === "urgent" && t.status !== "done";
                  if (siteTaskFilter === "Defects") return t.category === "defect" && t.status !== "done";
                  return t.status !== "done" && t.status !== "wont_do";
                });
                const groups = [
                  { label: "Urgent", tasks: filtered.filter(t => t.priority === "urgent") },
                  { label: "Normal", tasks: filtered.filter(t => t.priority === "normal") },
                  { label: "When time permits", tasks: filtered.filter(t => t.priority === "when_time_permits") },
                  { label: "Done", tasks: filtered.filter(t => t.status === "done") },
                ].filter(g => (siteTaskFilter === "Done" ? g.label === "Done" : g.label !== "Done") && g.tasks.length > 0);

                if (!groups.length && !newTaskForm) return <p className="text-sm text-muted text-center py-4">No tasks</p>;
                return (
                  <div className="space-y-3">
                    {groups.map(g => (
                      <div key={g.label}>
                        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">{g.label}</p>
                        <div className="divide-y divide-hairline rounded-lg border border-hairline">
                          {g.tasks.map(task => (
                            <div key={task.id} className="flex items-start gap-3 px-3 py-2.5">
                              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] || "bg-gray-400"}`} />
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm text-ink ${task.status === "done" ? "line-through text-muted" : ""}`}>{task.title}</p>
                                {task.employees?.name && <p className="text-xs text-muted mt-0.5">assigned: {task.employees.name}</p>}
                                {(task.created_via === "voice_note" || task.created_via === "ai_extraction") && (
                                  <p className="text-xs text-muted">via voice note</p>
                                )}
                                {task.completion_notes && (
                                  <p className="text-xs text-muted mt-0.5">{task.completion_notes}</p>
                                )}
                                {task.completion_photo_signed_url && (
                                  <a href={task.completion_photo_signed_url} target="_blank" rel="noreferrer" className="inline-block mt-1">
                                    <img src={task.completion_photo_signed_url} alt="Completion photo" className="w-16 h-16 rounded object-cover border border-hairline" />
                                  </a>
                                )}
                              </div>
                              {task.status !== "done" && (
                                <button
                                  type="button"
                                  onClick={() => completeSiteTask(task.id)}
                                  className="text-xs text-green-700 font-medium hover:underline shrink-0"
                                >
                                  Done
                                </button>
                              )}
                              {task.status === "done" && (
                                <span className="text-green-500 text-xs shrink-0">✓</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
          </div>
        )}
      </section>

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

// Operations + Schedule redesign MOCK-UP (review-only, non-production).
// Rendered only at /ui-review/ops-redesign-mockup* when VITE_UI_REVIEW_MODE=true
// (gated + lazy-imported in App.jsx → tree-shaken from production builds).
//
// Demonstrates the H2 design direction with STATIC mock data — no fetches, no live
// wiring, no production routes touched. Built from the H1 foundation primitives in
// src/components/ui/ and the locked Sales patterns (command-centre, Action Queue,
// Board/Actions/List/Scorecard, stage-aware, mobile bottom-layer). Phase colours
// mirror PHASE_COLOR_MAP in src/lib/scheduleUtils.js for fidelity.
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import SectionCard from "../../components/ui/SectionCard.jsx";
import KpiCard from "../../components/ui/KpiCard.jsx";
import FilterChips from "../../components/ui/FilterChips.jsx";
import StickyActionBar from "../../components/ui/StickyActionBar.jsx";
import SafeBottomSpacer from "../../components/ui/SafeBottomSpacer.jsx";
import MobileTabs from "../../components/ui/MobileTabs.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";

/* ─────────────────────────── phase colours (mirror scheduleUtils.PHASE_COLOR_MAP) ─────────────────────────── */
const PHASE = {
  pre_construction: { label: "Pre-construction", color: "#64748b" },
  site_prep: { label: "Site prep", color: "#92400e" },
  site_slab: { label: "Slab", color: "#78716c" },
  frame: { label: "Frame", color: "#ea580c" },
  roofing: { label: "Roofing", color: "#1e40af" },
  lock_up: { label: "Lock-up", color: "#0d9488" },
  rough_in: { label: "Rough-in", color: "#d97706" },
  fitout: { label: "Fit-out", color: "#0284c7" },
  completion: { label: "Completion", color: "#059669" },
};
const PHASE_ORDER = ["pre_construction", "site_prep", "site_slab", "frame", "roofing", "lock_up", "rough_in", "fitout", "completion"];

/* ─────────────────────────── mock data ─────────────────────────── */

const PROJECTS = [
  { id: "p1", address: "5A Gibson St, Marino", client: "Denberger Built", phase: "frame", progress: 42, health: "at_risk", overdue: 1, blocked: 1, trades: 4, nextMilestone: "Frame inspection", nextDate: "Thu 2 Jul", start: "Apr 2026", end: "Nov 2026" },
  { id: "p2", address: "24 Naldera Cres, Glenelg", client: "Harper Reno", phase: "fitout", progress: 76, health: "on_track", overdue: 0, blocked: 0, trades: 5, nextMilestone: "PC inspection", nextDate: "Fri 18 Jul", start: "Jan 2026", end: "Aug 2026" },
  { id: "p3", address: "2 Forrest Ave, Seacliff", client: "Forrest Extension", phase: "pre_construction", progress: 6, health: "behind", overdue: 2, blocked: 2, trades: 1, nextMilestone: "Council approval", nextDate: "Overdue 4d", start: "Jun 2026", end: "Feb 2027" },
  { id: "p4", address: "11 Hewitt Ave, Burnside", client: "Marlowe & Sons", phase: "roofing", progress: 58, health: "on_track", overdue: 0, blocked: 1, trades: 3, nextMilestone: "Roof handover", nextDate: "Wed 8 Jul", start: "Mar 2026", end: "Dec 2026" },
  { id: "p5", address: "9 Beulah Rd, Norwood", client: "The Pham Family", phase: "lock_up", progress: 64, health: "at_risk", overdue: 1, blocked: 0, trades: 4, nextMilestone: "Lock-up complete", nextDate: "Mon 14 Jul", start: "Feb 2026", end: "Oct 2026" },
];

// Cross-project Operations Action Queue — ranked: blocked/overdue/ripple-risk first.
const OPS_ACTIONS = [
  { id: "a1", kind: "procurement", project: "Marino", title: "Roof trusses not ordered", detail: "Order-by date passed — delays roofing start", due: "Overdue 3d", tone: "danger", bucket: "overdue", ripple: "Shifts 6 downstream tasks" },
  { id: "a2", kind: "trade", project: "Seacliff", title: "Electrician — no response (3 days)", detail: "Supervisor follow-up overdue; find backup?", due: "Overdue 1d", tone: "danger", bucket: "overdue" },
  { id: "a3", kind: "selection", project: "Seacliff", title: "Tile selection blocking waterproofing", detail: "Client decision outstanding — ripple risk", due: "Due today", tone: "warning", bucket: "today", ripple: "Holds 3 wet-area tasks" },
  { id: "a4", kind: "inspection", project: "Marino", title: "Book frame inspection", detail: "Frame at 90% — schedule certifier", due: "Due today", tone: "warning", bucket: "today" },
  { id: "a5", kind: "whs", project: "Burnside", title: "SWMS expiring — Plumber", detail: "Compliance doc expires in 5 days", due: "In 5d", tone: "warning", bucket: "soon" },
  { id: "a6", kind: "diary", project: "Norwood", title: "No site diary for 2 days", detail: "Frame trades on site — capture progress", due: "Watch", tone: "neutral", bucket: "watch" },
];

const KIND_ICON = { procurement: "📦", trade: "👷", selection: "🎨", inspection: "✅", whs: "🦺", diary: "📔" };

// Insights for the job command centre (mirrors OperationsProjectDetail insight cards).
const INSIGHTS = [
  { tone: "danger", icon: "📦", t: "Roof trusses overdue to order — blocks roofing" },
  { tone: "warning", icon: "🌧", t: "Rain forecast Thu — outdoor frame trades affected" },
  { tone: "warning", icon: "✅", t: "Frame inspection not yet booked" },
  { tone: "neutral", icon: "🏗", t: "Frame 90% — on track for lock-up" },
];

// Trades + supervisor actions (Trades tab).
const TRADES = [
  { name: "Carpenter — BCJ Framing", po: "issued", lastContact: "2 days ago", status: "on_site" },
  { name: "Roof Plumber — Apex", po: "draft", lastContact: "1 week ago", status: "awaiting" },
  { name: "Electrician — Voltaic", po: "issued", lastContact: "3 days ago", status: "no_response" },
  { name: "Plumber — FlowRite", po: "issued", lastContact: "Yesterday", status: "scheduled" },
];

// Site tasks, priority-grouped (Site Tasks tab).
const SITE_TASKS = {
  urgent: ["Brace north wall before inspection", "Confirm truss delivery slot"],
  normal: ["Order tie-down brackets", "Tidy site for inspection"],
  later: ["Update as-built notes"],
};

// Schedule tasks for the Gantt (16-week window). week = 1-based start, dur in weeks.
const SCHED = [
  { id: "t1", name: "Site establishment", phase: "site_prep", week: 1, dur: 1, pct: 100, status: "complete", baseWeek: 1, baseDur: 1 },
  { id: "t2", name: "Footings & slab", phase: "site_slab", week: 2, dur: 2, pct: 100, status: "complete", baseWeek: 2, baseDur: 2 },
  { id: "t3", name: "Wall frames", phase: "frame", week: 4, dur: 3, pct: 90, status: "critical", baseWeek: 4, baseDur: 2 },
  { id: "t4", name: "Frame inspection", phase: "frame", week: 7, dur: 0.4, pct: 0, status: "overdue", milestone: true, baseWeek: 6, baseDur: 0.4 },
  { id: "t5", name: "Roof trusses (order)", phase: "roofing", week: 7, dur: 0.6, pct: 0, status: "overdue", procurement: true, baseWeek: 6, baseDur: 0.6 },
  { id: "t6", name: "Roof cladding", phase: "roofing", week: 8, dur: 2, pct: 0, status: "critical", baseWeek: 7, baseDur: 2 },
  { id: "t7", name: "Lock-up (windows/doors)", phase: "lock_up", week: 10, dur: 2, pct: 0, status: "normal", baseWeek: 9, baseDur: 2 },
  { id: "t8", name: "Rough-in (elec/plumb)", phase: "rough_in", week: 11, dur: 2, pct: 0, status: "normal", baseWeek: 10, baseDur: 2 },
  { id: "t9", name: "Fit-out", phase: "fitout", week: 13, dur: 3, pct: 0, status: "normal", baseWeek: 12, baseDur: 3 },
];
const WEEKS = 16;
const TODAY_WEEK = 7; // "today" marker

/* ─────────────────────────── helpers ─────────────────────────── */
function healthVariant(h) {
  return h === "on_track" ? "success" : h === "at_risk" ? "warning" : "danger";
}
function healthLabel(h) {
  return h === "on_track" ? "On track" : h === "at_risk" ? "At risk" : "Behind";
}
function barColor(t) {
  if (t.status === "complete") return "#86efac";
  if (t.status === "overdue") return "#ef4444";
  if (t.status === "critical") return "#f59e0b";
  return PHASE[t.phase]?.color || "#94a3b8";
}
function pct(n) { return `${Math.round((n / WEEKS) * 100)}%`; }

/* ─────────────────────────── faithful static shell (Operations active) ─────────────────────────── */
const NAV = [
  { label: "Home", icon: "M3 12l2-2 7-7 7 7 2 2M5 10v10a1 1 0 001 1h12a1 1 0 001-1V10" },
  { label: "Confirm Queue", icon: "M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" },
  { label: "Sales", icon: "M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" },
  { label: "Tendering", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 12h6" },
  { label: "Operations", icon: "M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 15a1.65 1.65 0 00.33 1.82M4.6 9a1.65 1.65 0 01-.33-1.82", active: true },
  { label: "Workforce", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z" },
  { label: "Financials", icon: "M12 8c-1.7 0-3 .9-3 2s1.3 2 3 2 3 .9 3 2-1.3 2-3 2M12 6v12M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { label: "Marketing", icon: "M11 5.9V19a1.76 1.76 0 01-3.4.6L5.4 13.7M18 13a3 3 0 100-6" },
  { label: "Clients", icon: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" },
  { label: "Carpentry", icon: "M15 12l-8.5 8.5a2.1 2.1 0 01-3-3L12 9M17.6 15L22 10.4 19.6 8 16 11.6" },
];
function NavIcon({ d }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
function MockShell({ children, subActive = "Projects" }) {
  return (
    <div className="min-h-screen bg-page md:pl-[240px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] md:flex md:flex-col" style={{ background: "#1B2A3B" }}>
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/90 text-sm font-bold text-white">B</span>
          <span className="text-[15px] font-semibold tracking-tight text-white">Blue Leaf Hub</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map((n) => (
            <div key={n.label} className={`group relative flex items-center gap-3 px-3 py-2.5 ${n.active ? "text-white" : "text-white/60"}`}>
              {n.active && <span className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r bg-accent" />}
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${n.active ? "bg-white/15 text-white" : "text-white/70"}`}>
                <NavIcon d={n.icon} />
              </span>
              <span className="text-[13px] font-semibold">{n.label}</span>
            </div>
          ))}
          <div className="mb-1 ml-12 mr-2 mt-0.5 space-y-0.5">
            {["Projects", "Schedule", "Site Diary", "WHS", "Procurement"].map((m) => (
              <div key={m} className={`rounded-lg px-3 py-2 text-[12.5px] font-medium ${m === subActive ? "bg-white/10 text-white" : "text-white/50"}`}>{m}</div>
            ))}
          </div>
        </nav>
        <div className="border-t border-white/10 px-4 py-3 text-[11px] text-white/40">sam@blueleafbuilding.com.au</div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-hairline bg-surface/95 backdrop-blur md:hidden">
        <div className="flex items-center gap-3 px-3 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg text-ink">☰</span>
          <span className="text-[11px] text-muted">Operations</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 md:py-8">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface md:hidden">
        <div className="flex justify-around px-1 py-2">
          {["Sales", "Tender", "Ops", "Finance", "Marketing"].map((t, i) => (
            <div key={t} className={`flex min-w-[52px] flex-col items-center gap-0.5 text-[10px] font-semibold ${i === 2 ? "text-primary" : "text-ink"}`}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${i === 2 ? "bg-primary/10 text-primary" : "text-muted"}`}>
                <NavIcon d={NAV[i + 2]?.icon || NAV[4].icon} />
              </span>
              <span>{t}</span>
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
function MockBanner() {
  return (
    <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-xs text-ink">
      <strong>Mock-up — non-production.</strong> Static data, no wiring. Demonstrates the H2 Operations + Schedule redesign direction for review only.
    </div>
  );
}

/* ─────────────────────────── shared bits ─────────────────────────── */
function OpsActionRow({ a }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-hairline bg-surface p-3">
      <span className="mt-0.5 text-lg leading-none">{KIND_ICON[a.kind]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-ink">{a.title}</span>
          <StatusBadge variant={a.tone === "neutral" ? "neutral" : a.tone}>{a.due}</StatusBadge>
        </div>
        <div className="mt-0.5 truncate text-xs text-muted">{a.project} · {a.detail}</div>
        {a.ripple && (
          <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
            <span>⚠</span>{a.ripple}
          </div>
        )}
      </div>
      <button className="shrink-0 self-center rounded-lg border border-hairline px-2.5 py-1 text-[11px] font-semibold text-primary">Open →</button>
    </div>
  );
}

function ProjectCard({ p }) {
  const ph = PHASE[p.phase];
  return (
    <div className="rounded-card border border-hairline bg-surface p-4 transition hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">{p.address}</div>
          <div className="truncate text-xs text-muted">{p.client}</div>
        </div>
        <StatusBadge variant={healthVariant(p.health)} dot>{healthLabel(p.health)}</StatusBadge>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${ph.color}1a`, color: ph.color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: ph.color }} />{ph.label}
        </span>
        <span className="text-[11px] text-muted">{p.progress}% complete</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-page">
        <div className="h-full rounded-full" style={{ width: `${p.progress}%`, background: ph.color }} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-muted">Next: <span className="font-medium text-ink">{p.nextMilestone}</span></span>
        <span className={p.nextDate.startsWith("Overdue") ? "font-semibold text-red-600" : "text-muted"}>{p.nextDate}</span>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted">
        <span>👷 {p.trades} trades</span>
        {p.overdue > 0 && <StatusBadge variant="danger">{p.overdue} overdue</StatusBadge>}
        {p.blocked > 0 && <StatusBadge variant="blocked">{p.blocked} blocked</StatusBadge>}
      </div>
    </div>
  );
}

/* ─────────────────────────── VIEW 1 — Operations home ─────────────────────────── */
function OpsHomeMock() {
  const [view, setView] = useState("board");
  const totalOverdue = PROJECTS.reduce((s, p) => s + p.overdue, 0);
  const totalBlocked = PROJECTS.reduce((s, p) => s + p.blocked, 0);
  const views = [
    { value: "board", label: "Board" },
    { value: "actions", label: "Actions", count: OPS_ACTIONS.length },
    { value: "list", label: "List" },
    { value: "scorecard", label: "Scorecard" },
  ];
  // Group projects by phase for the board.
  const byPhase = PHASE_ORDER.map((ph) => ({ ph, items: PROJECTS.filter((p) => p.phase === ph) })).filter((g) => g.items.length);

  return (
    <>
      <MockBanner />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-ink">Operations</h1>
          <p className="text-xs text-muted">{PROJECTS.length} active projects · what’s happening, what’s blocked, what needs action</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink">Global Gantt</button>
          <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">+ New Project</button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Active projects" value={String(PROJECTS.length)} sub="in build" tone="primary" />
        <KpiCard label="On track" value="2" sub="health green" tone="success" />
        <KpiCard label="Needs action" value={String(OPS_ACTIONS.length)} sub="across projects" tone="warning" />
        <KpiCard label="Overdue tasks" value={String(totalOverdue)} sub="past due" tone="danger" />
        <KpiCard label="Blocked" value={String(totalBlocked)} sub="waiting on input" tone="danger" />
      </div>

      {/* view toggle */}
      <div className="mt-4"><FilterChips options={views} value={view} onChange={setView} /></div>

      {/* DESKTOP: Action Queue (decision-first) + Board grouped by phase */}
      <div className="mt-4 hidden gap-5 lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-3">
          <SectionCard title="Needs action now" desc="Ranked: blocked · overdue · ripple-risk">
            <div className="space-y-2">
              {OPS_ACTIONS.map((a) => <OpsActionRow key={a.id} a={a} />)}
            </div>
          </SectionCard>
        </div>
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Projects by phase</h2>
          <div className="space-y-4">
            {byPhase.map((g) => (
              <div key={g.ph}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <span className="h-2 w-2 rounded-full" style={{ background: PHASE[g.ph].color }} />{PHASE[g.ph].label}
                  </span>
                  <StatusBadge variant="stage">{g.items.length}</StatusBadge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {g.items.map((p) => <ProjectCard key={p.id} p={p} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MOBILE/TABLET: Action queue first, then stacked project cards */}
      <div className="mt-4 space-y-4 lg:hidden">
        <SectionCard title="Needs action now" desc="Ranked: blocked · overdue · ripple-risk">
          <div className="space-y-2">{OPS_ACTIONS.map((a) => <OpsActionRow key={a.id} a={a} />)}</div>
        </SectionCard>
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Projects</h2>
          <div className="space-y-3">{PROJECTS.map((p) => <ProjectCard key={p.id} p={p} />)}</div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────── VIEW 2 — Job command centre ─────────────────────────── */
function PhaseStepper({ current }) {
  const idx = PHASE_ORDER.indexOf(current);
  const shown = PHASE_ORDER.slice(1); // skip pre_construction label noise on a frame job
  return (
    <>
      <div className="hidden flex-wrap items-center gap-1 lg:flex">
        {shown.map((ph) => {
          const i = PHASE_ORDER.indexOf(ph);
          const state = i < idx ? "done" : i === idx ? "now" : "future";
          return (
            <span key={ph} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${state === "done" ? "bg-accent/10 text-accent" : state === "now" ? "bg-primary text-white ring-2 ring-primary/30" : "bg-slate-100 text-slate-400"}`}>
              {PHASE[ph].label}
            </span>
          );
        })}
      </div>
      <div className="lg:hidden">
        <span className="text-xs font-semibold text-muted">Phase {idx} — </span>
        <span className="text-xs font-bold text-primary">{PHASE[current].label}</span>
      </div>
    </>
  );
}
function InsightList() {
  return (
    <SectionCard title="Insights" desc="Today's alerts across this job">
      <div className="space-y-2">
        {INSIGHTS.map((n, i) => (
          <div key={i} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${n.tone === "danger" ? "bg-red-50 text-red-700" : n.tone === "warning" ? "bg-amber-50 text-amber-800" : "bg-accent/5 text-accent"}`}>
            <span>{n.icon}</span><span className="flex-1">{n.t}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
function ScheduleSnapshot() {
  return (
    <SectionCard title="Schedule snapshot" actions={<button className="text-xs font-semibold text-primary">Open schedule →</button>}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { k: "On site today", v: "6", t: "muted" },
          { k: "Complete", v: "42%", t: "muted" },
          { k: "Next milestone", v: "Frame insp.", t: "muted" },
          { k: "Projected end", v: "Nov 2026", t: "muted" },
        ].map((x) => (
          <div key={x.k} className="rounded-lg border border-hairline bg-page/60 p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted">{x.k}</div>
            <div className="mt-0.5 text-sm font-bold text-ink">{x.v}</div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
function TradesPanel() {
  const label = { issued: "PO issued", draft: "PO draft", on_site: "On site", awaiting: "Awaiting", no_response: "No response", scheduled: "Scheduled" };
  const tone = { on_site: "success", scheduled: "info", awaiting: "warning", no_response: "danger" };
  return (
    <SectionCard title="Trades" desc="Accepted trades · supervisor follow-ups">
      <div className="space-y-2">
        {TRADES.map((t) => (
          <div key={t.name} className="flex items-center gap-2 rounded-lg border border-hairline px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">{t.name}</div>
              <div className="text-[11px] text-muted">{label[t.po]} · last contact {t.lastContact}</div>
            </div>
            <StatusBadge variant={tone[t.status] || "neutral"}>{label[t.status]}</StatusBadge>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
function SiteTasksPanel() {
  const groups = [
    { key: "urgent", label: "Urgent", variant: "danger" },
    { key: "normal", label: "Normal", variant: "info" },
    { key: "later", label: "When time permits", variant: "neutral" },
  ];
  return (
    <SectionCard title="Site tasks" actions={<button className="text-xs font-semibold text-primary">+ Add</button>}>
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.key}>
            <div className="mb-1 flex items-center gap-2"><span className="text-xs font-semibold text-ink">{g.label}</span><StatusBadge variant={g.variant}>{SITE_TASKS[g.key].length}</StatusBadge></div>
            <div className="space-y-1">
              {SITE_TASKS[g.key].map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" className="rounded border-hairline" readOnly /> {t}</label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
function NextActionCard() {
  return (
    <SectionCard className="border-primary/30 bg-primary/[0.03]">
      <div className="text-xs font-semibold uppercase tracking-wide text-primary">Do this now</div>
      <p className="mt-1 text-sm text-ink">Roof trusses are overdue to order — this blocks roofing and shifts 6 tasks.</p>
      <button className="mt-3 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white">Issue Purchase Order →</button>
      <button className="mt-2 w-full rounded-lg border border-hairline px-4 py-2 text-sm font-semibold text-ink">Book frame inspection</button>
    </SectionCard>
  );
}
function BlockersCard() {
  return (
    <SectionCard title="Blockers">
      <div className="space-y-2">
        {OPS_ACTIONS.filter((a) => a.project === "Marino").map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <span>{KIND_ICON[a.kind]}</span><span className="flex-1">{a.title}</span><span className="text-[11px]">{a.due}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
function JobMeta() {
  return (
    <SectionCard title="Key details">
      {[["Client", "Denberger Built"], ["Phase", "Frame (4 of 9)"], ["Started", "Apr 2026"], ["Projected end", "Nov 2026"], ["Supervisor", "Sam"], ["Buildexact", "Linked"]].map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-3 py-1.5 text-sm"><span className="text-muted">{k}</span><span className="truncate text-right font-medium text-ink">{v}</span></div>
      ))}
    </SectionCard>
  );
}
function ClientUpdateCard() {
  return (
    <SectionCard title="Client update" actions={<button className="text-xs font-semibold text-primary">Publish →</button>}>
      <p className="text-sm text-ink">Frame nearly complete. Roof trusses next.</p>
      <p className="mt-1 text-[11px] text-muted">Last published to portal: 3 days ago · 🟢 On track</p>
    </SectionCard>
  );
}
function FilesNotesCard() {
  return (
    <SectionCard title="Files & notes">
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2"><span>📎</span><span className="flex-1 truncate text-ink">frame-inspection-checklist.pdf</span></div>
        <div className="flex items-center gap-2"><span>📎</span><span className="flex-1 truncate text-ink">truss-layout.pdf</span></div>
        <p className="mt-1 rounded-md bg-page px-2 py-1.5 text-xs text-muted">“Brace north wall before certifier visit.”</p>
      </div>
    </SectionCard>
  );
}
function JobCommandCentreMock() {
  const [tab, setTab] = useState("today");
  const tabs = [
    { value: "today", label: "Today" },
    { value: "schedule", label: "Schedule" },
    { value: "trades", label: "Trades" },
    { value: "tasks", label: "Tasks" },
    { value: "files", label: "Files" },
  ];
  return (
    <>
      <MockBanner />
      {/* sticky compact header */}
      <div className="sticky top-0 z-10 -mx-4 border-b border-hairline bg-surface/95 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-base font-bold text-ink">5A Gibson St, Marino</span>
              <StatusBadge variant="warning" dot>At risk</StatusBadge>
            </div>
            <div className="truncate text-xs text-muted">Denberger Built · Frame · 42% complete · Nov 2026</div>
          </div>
          <button className="hidden shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white lg:block">Issue PO →</button>
        </div>
        <div className="mt-2"><PhaseStepper current="frame" /></div>
      </div>

      {/* DESKTOP command-centre: main workspace + sticky right rail */}
      <div className="mt-4 hidden gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <InsightList />
          <ScheduleSnapshot />
          <TradesPanel />
          <SiteTasksPanel />
        </div>
        <div className="space-y-4 self-start lg:sticky lg:top-28">
          <NextActionCard />
          <BlockersCard />
          <JobMeta />
          <ClientUpdateCard />
          <FilesNotesCard />
        </div>
      </div>

      {/* MOBILE/TABLET: tabs + sticky action */}
      <div className="mt-4 lg:hidden">
        <MobileTabs tabs={tabs} value={tab} onChange={setTab} />
        <div className="mt-3 space-y-4">
          {tab === "today" && <><NextActionCard /><InsightList /><BlockersCard /></>}
          {tab === "schedule" && <ScheduleSnapshot />}
          {tab === "trades" && <TradesPanel />}
          {tab === "tasks" && <SiteTasksPanel />}
          {tab === "files" && <><JobMeta /><ClientUpdateCard /><FilesNotesCard /></>}
        </div>
        <StickyActionBar position="fixed" className="!bottom-[60px] md:!bottom-0">
          <button className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white">Issue Purchase Order →</button>
        </StickyActionBar>
        <SafeBottomSpacer height={140} />
      </div>
    </>
  );
}

/* ─────────────────────────── VIEW 3 — Schedule ─────────────────────────── */
function GanttRow({ t }) {
  const ph = PHASE[t.phase];
  return (
    <div className="flex items-center gap-2 border-b border-hairline/60 py-1.5">
      <div className="flex w-44 shrink-0 items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ph.color }} />
        <span className="truncate text-xs font-medium text-ink">{t.name}</span>
      </div>
      <div className="relative h-5 flex-1">
        {/* baseline ghost */}
        <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200" style={{ left: pct(t.baseWeek - 1), width: pct(Math.max(t.baseDur, 0.35)) }} />
        {/* current bar */}
        <div className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full" style={{ left: pct(t.week - 1), width: pct(Math.max(t.dur, 0.35)), background: barColor(t) }} title={t.name}>
          {t.pct > 0 && t.pct < 100 && <div className="h-full rounded-full bg-black/15" style={{ width: `${t.pct}%` }} />}
        </div>
        {t.milestone && <span className="absolute top-1/2 -translate-y-1/2 text-[10px]" style={{ left: pct(t.week - 1) }}>◆</span>}
      </div>
    </div>
  );
}
function ScheduleMock() {
  const [view, setView] = useState("gantt");
  const [range, setRange] = useState("all");
  const views = [
    { value: "gantt", label: "Gantt" },
    { value: "sheet", label: "Sheet" },
    { value: "delays", label: "Delays", count: 1 },
    { value: "map", label: "Dep Map" },
  ];
  const ranges = [
    { value: "all", label: "All" },
    { value: "today", label: "Today", count: 2 },
    { value: "week", label: "This week", count: 3 },
    { value: "delayed", label: "Delayed", count: 2 },
    { value: "blocked", label: "Blocked", count: 1 },
  ];
  const overdue = SCHED.filter((t) => t.status === "overdue");
  const thisWeek = SCHED.filter((t) => t.week <= TODAY_WEEK + 1 && t.week >= TODAY_WEEK - 1 && t.status !== "complete");

  return (
    <>
      <MockBanner />
      <div className="sticky top-0 z-10 -mx-4 border-b border-hairline bg-surface/95 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><span className="truncate text-base font-bold text-ink">Schedule — 5A Gibson St, Marino</span><StatusBadge variant="warning">2 overdue</StatusBadge></div>
            <div className="truncate text-xs text-muted">Baseline locked 25 Feb · 1 task drifting · critical path live</div>
          </div>
          <button className="hidden shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white lg:block">+ Add task</button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <FilterChips options={views} value={view} onChange={setView} />
      </div>
      <div className="mt-2"><FilterChips options={ranges} value={range} onChange={setRange} /></div>

      {/* ripple/critical alert */}
      <div className="mt-3 flex flex-wrap gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700"><span>⚠</span>Roof trusses overdue → ripple shifts 6 downstream tasks</div>
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800"><span>▸</span>Critical path: Frame → Roof → Lock-up</div>
      </div>

      {/* DESKTOP: ranked needs-action surface (pairs with the Gantt) + Gantt */}
      <div className="mt-4 hidden lg:block">
        <SectionCard title="Needs action now" desc="Overdue & blocked tasks — resolve before they ripple" className="mb-4">
          <div className="flex flex-wrap gap-2">
            {overdue.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700">
                <span className="h-2 w-2 rounded-full" style={{ background: PHASE[t.phase].color }} />{t.name}
                <StatusBadge variant="danger">Overdue</StatusBadge>
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">🎨 Tile selection — blocks waterproofing<StatusBadge variant="blocked">Blocked</StatusBadge></span>
          </div>
        </SectionCard>
        <SectionCard>
          {/* week header */}
          <div className="flex items-center gap-2 border-b border-hairline pb-1.5">
            <div className="w-44 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted">Task</div>
            <div className="relative flex-1">
              <div className="flex justify-between text-[10px] text-muted">
                {Array.from({ length: 9 }, (_, i) => <span key={i}>W{i * 2 + 1}</span>)}
              </div>
              <div className="pointer-events-none absolute -bottom-1 top-4 w-px bg-primary/50" style={{ left: pct(TODAY_WEEK - 1) }} />
            </div>
          </div>
          <div className="relative">
            {SCHED.map((t) => <GanttRow key={t.id} t={t} />)}
            <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-primary/40" style={{ left: `calc(11rem + ${pct(TODAY_WEEK - 1)})` }} />
          </div>
          {/* legend */}
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded bg-slate-200" />Baseline</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded" style={{ background: "#ef4444" }} />Overdue</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded" style={{ background: "#f59e0b" }} />Critical</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded" style={{ background: "#86efac" }} />Complete</span>
            <span className="inline-flex items-center gap-1">◆ Milestone</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-px bg-primary/60" />Today</span>
          </div>
        </SectionCard>
      </div>

      {/* MOBILE/TABLET: NOT a squeezed Gantt — lookahead grouped list */}
      <div className="mt-4 space-y-4 lg:hidden">
        <SectionCard title="Overdue" desc="Resolve these first">
          {overdue.length ? (
            <div className="space-y-2">
              {overdue.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: PHASE[t.phase].color }} />
                  <span className="flex-1 text-sm font-medium text-ink">{t.name}</span>
                  <StatusBadge variant="danger">Overdue</StatusBadge>
                </div>
              ))}
            </div>
          ) : <EmptyState compact title="Nothing overdue" hint="You're on track." />}
        </SectionCard>
        <SectionCard title="This week & next" desc="3-week lookahead">
          <div className="space-y-2">
            {thisWeek.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border border-hairline px-3 py-2">
                <span className="h-2 w-2 rounded-full" style={{ background: PHASE[t.phase].color }} />
                <span className="flex-1 text-sm text-ink">{t.name}</span>
                <span className="text-[11px] text-muted">W{t.week}</span>
              </div>
            ))}
          </div>
        </SectionCard>
        <StickyActionBar position="fixed" className="!bottom-[60px] md:!bottom-0">
          <button className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white">+ Add task</button>
        </StickyActionBar>
        <SafeBottomSpacer height={140} />
      </div>
    </>
  );
}

/* ─────────────────────────── router ─────────────────────────── */
export default function OpsRedesignMockup() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.documentElement.setAttribute("data-ui-review-ready", "true");
  }, [pathname]);

  let view = "home";
  if (pathname.endsWith("/schedule")) view = "schedule";
  else if (pathname.endsWith("/job")) view = "job";

  const subActive = view === "schedule" ? "Schedule" : "Projects";

  return (
    <div data-ui-review-ready="true">
      <MockShell subActive={subActive}>
        {view === "home" && <OpsHomeMock />}
        {view === "job" && <JobCommandCentreMock />}
        {view === "schedule" && <ScheduleMock />}
      </MockShell>
    </div>
  );
}

// Sales redesign MOCK-UP (review-only, non-production).
// Rendered only at /ui-review/sales-redesign-mockup* when VITE_UI_REVIEW_MODE=true
// (gated + lazy-imported in App.jsx → tree-shaken from production builds).
//
// Demonstrates the intended Pass 2/3 design direction with STATIC mock data —
// no fetches, no live wiring, no production routes touched. Mirrors the lead
// fixtures in src/ui-review/fixtures/sales.js so it reads like the rest of the
// UI Review export. Built from the Pass 1 primitives in src/components/ui/.
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { displayLeadName } from "../../lib/leadUtils.js";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import SectionCard from "../../components/ui/SectionCard.jsx";
import KpiCard from "../../components/ui/KpiCard.jsx";
import FilterChips from "../../components/ui/FilterChips.jsx";
import StickyActionBar from "../../components/ui/StickyActionBar.jsx";
import SafeBottomSpacer from "../../components/ui/SafeBottomSpacer.jsx";
import MobileTabs from "../../components/ui/MobileTabs.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";

/* ─────────────────────────── mock data ─────────────────────────── */

const STAGES = [
  { id: "enquiry", label: "Enquiry" },
  { id: "qualify", label: "Qualify" },
  { id: "discovery", label: "Discovery" },
  { id: "winning_offer", label: "Winning Offer" },
  { id: "fee_proposal", label: "Fee Proposal" },
  { id: "accepted", label: "Accepted" },
  { id: "tender", label: "Tender" },
  { id: "won", label: "Won" },
];

const TYPE_LABEL = { new_home: "New home", extension: "Extension", renovation: "Renovation" };

// One+ lead per stage (accepted intentionally empty → shows empty state).
const LEADS = [
  { id: "l1", name: "Olivia & Marcus Reed", suburb: "Brighton", project_type: "new_home", estimated_value: 485000, qualify_score: 3, stage: "enquiry", daysInStage: 2, idleDays: 1, nextAction: "Call to book discovery", due: "Today", needsAction: true, owner: "Dana" },
  { id: "l2", name: "The Whitfield Family", suburb: "Somerton Park", project_type: "extension", estimated_value: 320000, qualify_score: 2, stage: "enquiry", daysInStage: 5, idleDays: 16, nextAction: "Send intro pack", due: "2 days ago", needsAction: true, overdue: true, owner: "Dana" },
  { id: "l3", name: "Priya Nadkarni", suburb: "Glenelg", project_type: "renovation", estimated_value: 540000, qualify_score: 5, stage: "qualify", daysInStage: 3, idleDays: 2, nextAction: "Confirm budget range", due: "Fri", owner: "Dana" },
  { id: "l4", name: "James & Eva Holloway", suburb: "Henley Beach", project_type: "new_home", estimated_value: 705000, qualify_score: 6, stage: "qualify", daysInStage: 8, idleDays: 4, nextAction: "Book site visit", due: "Mon", needsAction: true, owner: "Sam" },
  { id: "l5", name: "Theo Castellano", suburb: "Unley", project_type: "renovation", estimated_value: 610000, qualify_score: 6, stage: "discovery", daysInStage: 6, idleDays: 12, nextAction: "Write discovery notes", due: "Wed", owner: "Sam" },
  { id: "l6", name: "Sandhurst Developments", suburb: "Mitcham", project_type: "extension", estimated_value: 880000, qualify_score: 7, stage: "winning_offer", daysInStage: 4, idleDays: 3, nextAction: "Present winning offer", due: "Thu", needsAction: true, owner: "Sam" },
  { id: "l7", name: "Bayside Property Co", suburb: "Hove", project_type: "new_home", estimated_value: 960000, qualify_score: 7, stage: "fee_proposal", daysInStage: 9, idleDays: 31, nextAction: "Chase PTSA signature", due: "5 days ago", needsAction: true, overdue: true, owner: "Sam" },
  { id: "l8", name: "Anneke Visser", suburb: "Stirling", project_type: "extension", estimated_value: 770000, qualify_score: 6, stage: "fee_proposal", daysInStage: 2, idleDays: 1, nextAction: "Generate PTSA", due: "Today", needsAction: true, owner: "Dana" },
  { id: "l9", name: "Marlowe & Sons", suburb: "Burnside", project_type: "new_home", estimated_value: 1450000, qualify_score: 8, stage: "tender", daysInStage: 3, idleDays: 2, nextAction: "Proceed to RFQ Engine", due: "Today", needsAction: true, owner: "Sam", site_address: "14 Hewitt Ave, Burnside SA", job_id: "job-2201" },
  { id: "l10", name: "The Pham Family", suburb: "Norwood", project_type: "new_home", estimated_value: 1120000, qualify_score: 8, stage: "won", daysInStage: 1, idleDays: 0, owner: "Sam", site_address: "9 Beulah Rd, Norwood SA" },
];

const NURTURE = [
  { id: "n1", name: "Greg & Fiona Marsh", suburb: "Glen Osmond", estimated_value: 900000, kind: "nurture" },
  { id: "n2", name: "Amy Kowalski", suburb: "Prospect", estimated_value: 410000, kind: "nurture" },
  { id: "x1", name: "Pete D'Angelo", suburb: "Magill", estimated_value: 0, kind: "lost" },
];

const ACTIVE_LEAD = LEADS.find((l) => l.id === "l9"); // tender stage — the "action buried" case, fixed
const WON_LEAD = LEADS.find((l) => l.id === "l10");

function money(n) {
  if (!n) return "$0";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}m`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${n}`;
}
function rotVariant(idle) {
  if (idle >= 30) return "danger";
  if (idle >= 14) return "warning";
  return null;
}
function leadsInStage(id) {
  return LEADS.filter((l) => l.stage === id);
}

/* ─────────────────────────── faithful static shell ─────────────────────────── */

const NAV = [
  { label: "Home", icon: "M3 12l2-2 7-7 7 7 2 2M5 10v10a1 1 0 001 1h12a1 1 0 001-1V10" },
  { label: "Confirm Queue", icon: "M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" },
  { label: "Sales", icon: "M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z", active: true },
  { label: "Tendering", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 12h6" },
  { label: "Operations", icon: "M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 15a1.65 1.65 0 00.33 1.82M4.6 9a1.65 1.65 0 01-.33-1.82" },
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

function MockShell({ children }) {
  return (
    <div className="min-h-screen bg-page md:pl-[240px]">
      {/* Desktop sidebar — faithful to AppShell: deep navy #1B2A3B (not black), accent active bar */}
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
          {/* Active department sub-modules (Sales) */}
          <div className="mb-1 ml-12 mr-2 mt-0.5 space-y-0.5">
            {["Pipeline", "Relationships", "Contacts", "Reference Projects"].map((m, i) => (
              <div key={m} className={`rounded-lg px-3 py-2 text-[12.5px] font-medium ${i === 0 ? "bg-white/10 text-white" : "text-white/50"}`}>{m}</div>
            ))}
          </div>
        </nav>
        <div className="border-t border-white/10 px-4 py-3 text-[11px] text-white/40">sam@blueleafbuilding.com.au</div>
      </aside>

      {/* Mobile top header (faithful) */}
      <header className="sticky top-0 z-20 border-b border-hairline bg-surface/95 backdrop-blur md:hidden">
        <div className="flex items-center gap-3 px-3 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg text-ink">☰</span>
          <span className="text-[11px] text-muted">Sales</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 md:py-8">{children}</main>

      {/* Mobile bottom nav (faithful) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface md:hidden">
        <div className="flex justify-around px-1 py-2">
          {["Sales", "Tender", "Ops", "Finance", "Marketing"].map((t, i) => (
            <div key={t} className={`flex min-w-[52px] flex-col items-center gap-0.5 text-[10px] font-semibold ${i === 0 ? "text-primary" : "text-ink"}`}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${i === 0 ? "bg-primary/10 text-primary" : "text-muted"}`}>
                <NavIcon d={NAV[i + 2]?.icon || NAV[2].icon} />
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
      <strong>Mock-up — non-production.</strong> Static data, no wiring. Demonstrates the Pass 2/3 Sales redesign direction for review only.
    </div>
  );
}

/* ─────────────────────────── pipeline mock ─────────────────────────── */

function ScoreBadge({ score }) {
  const v = score >= 6 ? "success" : score >= 4 ? "warning" : "neutral";
  return <StatusBadge variant={v}>{score}/8</StatusBadge>;
}

function LeadCard({ lead, compact }) {
  const rot = rotVariant(lead.idleDays);
  return (
    <div className="rounded-lg border border-hairline bg-surface p-3 transition hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {rot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${rot === "danger" ? "bg-red-500" : "bg-amber-500"}`} />}
          <span className="truncate text-sm font-semibold text-ink">{displayLeadName(lead)}</span>
        </div>
        <ScoreBadge score={lead.qualify_score} />
      </div>
      <div className="mt-0.5 truncate text-xs text-muted">{lead.suburb} · {TYPE_LABEL[lead.project_type]}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <StatusBadge variant="money">{money(lead.estimated_value)}</StatusBadge>
        {!compact && <span className="text-[11px] text-muted">{lead.daysInStage}d in stage</span>}
      </div>
      {lead.nextAction && (
        <div className={`mt-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ${lead.overdue ? "bg-red-50 text-red-700" : "bg-primary/5 text-primary"}`}>
          <span>→</span>
          <span className="truncate">{lead.nextAction}</span>
          <span className="ml-auto shrink-0 opacity-80">{lead.due}</span>
        </div>
      )}
    </div>
  );
}

function KanbanColumn({ stage }) {
  const ls = leadsInStage(stage.id);
  return (
    <div className="flex w-[236px] shrink-0 flex-col rounded-card border border-hairline bg-page/60">
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{stage.label}</span>
        <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-bold text-slate-600">{ls.length}</span>
      </div>
      <div className="flex max-h-[560px] flex-col gap-2 overflow-y-auto p-2">
        {ls.length ? ls.map((l) => <LeadCard key={l.id} lead={l} />) : (
          <EmptyState compact title={`No ${stage.label.toLowerCase()} leads`} hint="Drag a card here or add a lead." />
        )}
      </div>
    </div>
  );
}

function NurtureDock() {
  const nurture = NURTURE.filter((n) => n.kind === "nurture");
  const lost = NURTURE.filter((n) => n.kind === "lost");
  return (
    <div className="flex w-[150px] shrink-0 flex-col gap-2 rounded-card border border-dashed border-hairline bg-page/40 p-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Off-pipeline</div>
      <div className="rounded-lg border border-hairline bg-surface px-2.5 py-2">
        <div className="flex items-center justify-between"><span className="text-xs font-semibold text-ink">Nurture</span><StatusBadge variant="neutral">{nurture.length}</StatusBadge></div>
        <div className="mt-1 truncate text-[11px] text-muted">{nurture[0]?.name}…</div>
        <button className="mt-1.5 text-[11px] font-semibold text-primary">Expand →</button>
      </div>
      <div className="rounded-lg border border-hairline bg-surface px-2.5 py-2">
        <div className="flex items-center justify-between"><span className="text-xs font-semibold text-ink">Lost</span><StatusBadge variant="neutral">{lost.length}</StatusBadge></div>
        <button className="mt-1.5 text-[11px] font-semibold text-primary">Expand →</button>
      </div>
    </div>
  );
}

function PipelineMock() {
  const [filter, setFilter] = useState("all");
  const needsAction = LEADS.filter((l) => l.needsAction).length;
  const overdue = LEADS.filter((l) => l.overdue).length;
  const chips = [
    { value: "all", label: "All leads", count: LEADS.length },
    { value: "needs", label: "Needs action", count: needsAction },
    { value: "overdue", label: "Overdue", count: overdue },
    { value: "high", label: "High value" },
    { value: "recent", label: "Recently updated" },
  ];

  return (
    <>
      <MockBanner />
      {/* compact header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-ink">Sales Pipeline</h1>
          <p className="text-xs text-muted">9 active leads · APB 8-stage pipeline</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink">+ Architect Tender</button>
          <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">+ Add Lead</button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Pipeline value" value="$6.72m" sub="9 active leads" tone="primary" />
        <KpiCard label="Weighted" value="$3.4m" sub="stage-probability" />
        <KpiCard label="Needs action" value={String(needsAction)} sub="due / overdue" tone="warning" />
        <KpiCard label="Overdue" value={String(overdue)} sub="no activity 14d+" tone="danger" />
        <KpiCard label="Won / lost" value="3 / 1" sub="this month" tone="success" />
      </div>

      {/* filters */}
      <div className="mt-4"><FilterChips options={chips} value={filter} onChange={setFilter} /></div>

      {/* DESKTOP kanban (lg+) — tighter columns, internal scroll, stage count, Nurture dock */}
      <div className="mt-4 hidden gap-3 overflow-x-auto pb-2 lg:flex">
        {STAGES.map((s) => <KanbanColumn key={s.id} stage={s} />)}
        <NurtureDock />
      </div>

      {/* TABLET + MOBILE grouped list (< lg) — stage chips + grouped cards, no horizontal kanban */}
      <div className="mt-4 lg:hidden">
        <div className="flex gap-1.5 overflow-x-auto pb-2">
          {STAGES.map((s) => (
            <span key={s.id} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-hairline bg-surface px-2.5 py-1 text-xs font-semibold text-muted">
              {s.label}<span className="rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500">{leadsInStage(s.id).length}</span>
            </span>
          ))}
        </div>
        <div className="mt-2 space-y-4">
          {STAGES.filter((s) => leadsInStage(s.id).length).map((s) => (
            <div key={s.id}>
              <div className="mb-1.5 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-ink">{s.label}</h2>
                <StatusBadge variant="stage">{leadsInStage(s.id).length}</StatusBadge>
              </div>
              <div className="space-y-2">
                {leadsInStage(s.id).map((l) => <LeadCard key={l.id} lead={l} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────── lead detail mock ─────────────────────────── */

function StageStepper({ current }) {
  const idx = STAGES.findIndex((s) => s.id === current);
  return (
    <>
      {/* desktop: full row, no scroll, current ringed */}
      <div className="hidden items-center gap-1 lg:flex">
        {STAGES.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${i < idx ? "bg-accent/10 text-accent" : i === idx ? "bg-primary text-white ring-2 ring-primary/30" : "bg-slate-100 text-slate-400"}`}>{s.label}</span>
            {i < STAGES.length - 1 && <span className={`h-px w-3 ${i < idx ? "bg-accent/40" : "bg-hairline"}`} />}
          </div>
        ))}
      </div>
      {/* compact: "Stage n/8 — Name" */}
      <div className="lg:hidden">
        <span className="text-xs font-semibold text-muted">Stage {idx + 1}/8 — </span>
        <span className="text-xs font-bold text-primary">{STAGES[idx].label}</span>
      </div>
    </>
  );
}

function MetaRow({ k, v }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted">{k}</span>
      <span className="truncate text-right font-medium text-ink">{v}</span>
    </div>
  );
}

function KeyMetadata({ lead }) {
  return (
    <SectionCard title="Key details">
      <MetaRow k="Estimated value" v={money(lead.estimated_value)} />
      <MetaRow k="Qualifying" v={`${lead.qualify_score}/8`} />
      <MetaRow k="Suburb" v={lead.suburb} />
      <MetaRow k="Project type" v={TYPE_LABEL[lead.project_type]} />
      <MetaRow k="Site address" v={lead.site_address || "—"} />
      <MetaRow k="Owner" v={lead.owner} />
    </SectionCard>
  );
}

function ActivityTimeline() {
  const items = [
    { icon: "📞", t: "Intro call — keen, budget confirmed", at: "2 days ago" },
    { icon: "📝", t: "Discovery notes added", at: "5 days ago" },
    { icon: "📄", t: "Concept plans uploaded", at: "1 week ago" },
  ];
  return (
    <SectionCard title="Activity">
      <div className="space-y-2.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-start gap-2.5 text-sm">
            <span className="text-base leading-none">{it.icon}</span>
            <span className="min-w-0 flex-1 text-ink">{it.t}</span>
            <span className="shrink-0 text-xs text-muted">{it.at}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function FilesNotes() {
  return (
    <SectionCard title="Files & notes">
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2"><span>📎</span><span className="flex-1 truncate text-ink">site-survey.pdf</span></div>
        <div className="flex items-center gap-2"><span>📎</span><span className="flex-1 truncate text-ink">concept-plans.pdf</span></div>
        <p className="mt-1 rounded-md bg-page px-2 py-1.5 text-xs text-muted">“Sent winning-offer pack; following up Friday.”</p>
      </div>
    </SectionCard>
  );
}

function StageWorkspace({ lead, won }) {
  if (won) {
    return (
      <SectionCard>
        <div className="flex items-start gap-3">
          <span className="text-2xl">🎉</span>
          <div>
            <div className="flex items-center gap-2"><h2 className="text-base font-bold text-ink">Lead won</h2><StatusBadge variant="success" dot>Won</StatusBadge></div>
            <p className="mt-1 text-sm text-muted">{displayLeadName(lead)} accepted. Next: hand off to delivery — create the job and brief the Tender Manager.</p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {["Qualifying 8/8", "Winning offer ✓", "Fee proposal signed ✓"].map((p) => (
            <div key={p} className="rounded-lg bg-accent/5 px-3 py-2 text-xs font-medium text-accent">{p}</div>
          ))}
        </div>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Tender readiness" desc="Everything below is cleared — proceed to the RFQ Engine.">
      <div className="space-y-2">
        {[
          { ok: true, t: "Site address set", v: lead.site_address },
          { ok: true, t: "Job created from lead", v: lead.job_id },
          { ok: true, t: "Qualifying complete", v: `${lead.qualify_score}/8` },
        ].map((g) => (
          <div key={g.t} className="flex items-center gap-2 rounded-lg bg-accent/5 px-3 py-2">
            <span className="text-accent">✓</span>
            <span className="flex-1 text-sm font-medium text-ink">{g.t}</span>
            <span className="truncate text-xs text-muted">{g.v}</span>
          </div>
        ))}
      </div>
      {/* prior stages collapsed to summary pills */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {["Enquiry ✓", "Qualify 8/8", "Discovery ✓", "Winning offer ✓", "Fee proposal signed ✓"].map((p) => (
          <span key={p} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{p}</span>
        ))}
      </div>
    </SectionCard>
  );
}

function NextActionCard({ won }) {
  if (won) {
    return (
      <SectionCard className="border-accent/30 bg-accent/[0.04]">
        <div className="text-xs font-semibold uppercase tracking-wide text-accent">Next step</div>
        <p className="mt-1 text-sm text-ink">Lead complete — move it into delivery.</p>
        <button className="mt-3 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white">Create Job →</button>
        <button className="mt-2 w-full rounded-lg border border-hairline px-4 py-2 text-sm font-semibold text-ink">Hand off to Tender Manager</button>
      </SectionCard>
    );
  }
  return (
    <SectionCard className="border-primary/30 bg-primary/[0.03]">
      <div className="text-xs font-semibold uppercase tracking-wide text-primary">Do this now</div>
      <p className="mt-1 text-sm text-ink">All tender gates cleared. Start the estimate.</p>
      <button className="mt-3 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white">Proceed to RFQ Engine & Estimate →</button>
      <p className="mt-2 text-center text-[11px] text-muted">Job linked · ready to advance to Tender</p>
    </SectionCard>
  );
}

function LeadDetailMock({ won }) {
  const lead = won ? WON_LEAD : ACTIVE_LEAD;
  const [tab, setTab] = useState("summary");
  const primaryLabel = won ? "Create Job →" : "Proceed to RFQ Engine →";

  const tabs = [
    { value: "summary", label: "Summary" },
    { value: "action", label: "Action" },
    { value: "activity", label: "Activity" },
    { value: "files", label: "Files" },
    { value: "notes", label: "Notes" },
  ];

  return (
    <>
      <MockBanner />

      {/* sticky compact header */}
      <div className="sticky top-0 z-10 -mx-4 border-b border-hairline bg-surface/95 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-base font-bold text-ink">{displayLeadName(lead)}</span>
              {won
                ? <StatusBadge variant="success" dot>Won</StatusBadge>
                : <StatusBadge variant="stage">{STAGES.find((s) => s.id === lead.stage).label}</StatusBadge>}
            </div>
            <div className="truncate text-xs text-muted">{lead.suburb} · {money(lead.estimated_value)} · Qualifying {lead.qualify_score}/8</div>
          </div>
          {/* one obvious primary action (desktop) */}
          <button className="hidden shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white lg:block">{primaryLabel}</button>
        </div>
        <div className="mt-2"><StageStepper current={lead.stage} /></div>
      </div>

      {/* DESKTOP command-centre (lg+): main workspace + activity | right rail */}
      <div className="mt-4 hidden gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <StageWorkspace lead={lead} won={won} />
          <ActivityTimeline />
        </div>
        <div className="space-y-4 self-start lg:sticky lg:top-28">
          <NextActionCard lead={lead} won={won} />
          <KeyMetadata lead={lead} />
          <FilesNotes />
        </div>
      </div>

      {/* TABLET + MOBILE (< lg): tabs + sticky action bar, single column */}
      <div className="mt-4 lg:hidden">
        <MobileTabs tabs={tabs} value={tab} onChange={setTab} />
        <div className="mt-3 space-y-4">
          {tab === "summary" && <><StageWorkspace lead={lead} won={won} /><KeyMetadata lead={lead} /></>}
          {tab === "action" && <NextActionCard lead={lead} won={won} />}
          {tab === "activity" && <ActivityTimeline />}
          {tab === "files" && <FilesNotes />}
          {tab === "notes" && <SectionCard title="Notes"><p className="text-sm text-muted">“Sent winning-offer pack; following up Friday.”</p></SectionCard>}
        </div>
        {/* sits above the shell's fixed bottom nav on mobile; nav is hidden ≥md so flush there */}
        <StickyActionBar position="fixed" className="!bottom-[60px] md:!bottom-0">
          <button className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white">{primaryLabel}</button>
        </StickyActionBar>
        <SafeBottomSpacer height={140} />
      </div>
    </>
  );
}

/* ─────────────────────────── router ─────────────────────────── */

export default function SalesRedesignMockup() {
  const { pathname } = useLocation();
  // Guarantee the screenshot ready-marker even though this page makes no fetches.
  useEffect(() => {
    document.documentElement.setAttribute("data-ui-review-ready", "true");
  }, [pathname]);

  let view = "pipeline";
  if (pathname.endsWith("/lead-won")) view = "won";
  else if (pathname.endsWith("/lead")) view = "lead";

  return (
    <div data-ui-review-ready="true">
      <MockShell>
        {view === "pipeline" && <PipelineMock />}
        {view === "lead" && <LeadDetailMock />}
        {view === "won" && <LeadDetailMock won />}
      </MockShell>
    </div>
  );
}

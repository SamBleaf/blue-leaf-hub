// Tender/RFQ + Procurement redesign MOCK-UP (review-only, non-production).
// Rendered only at /ui-review/h3-redesign-mockup* when VITE_UI_REVIEW_MODE=true
// (gated + lazy-imported in App.jsx → tree-shaken from production builds).
//
// STATIC data, no fetches, no live send/generate/sync. Demonstrates the H3 direction with the
// H1 primitives + locked Sales/H2 patterns. Answers: what quote/order is missing? who to chase?
// what must be ordered before it delays the job?
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

/* ─────────────────────────── shell (faithful AppShell) ─────────────────────────── */
const NAV = [
  { label: "Home", icon: "M3 12l2-2 7-7 7 7 2 2M5 10v10a1 1 0 001 1h12a1 1 0 001-1V10" },
  { label: "Confirm Queue", icon: "M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" },
  { label: "Sales", icon: "M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" },
  { label: "Tendering", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 12h6" },
  { label: "Operations", icon: "M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 15a1.65 1.65 0 00.33 1.82M4.6 9a1.65 1.65 0 01-.33-1.82" },
  { label: "Workforce", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z" },
  { label: "Financials", icon: "M12 8c-1.7 0-3 .9-3 2s1.3 2 3 2 3 .9 3 2-1.3 2-3 2M12 6v12M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { label: "Marketing", icon: "M11 5.9V19a1.76 1.76 0 01-3.4.6L5.4 13.7M18 13a3 3 0 100-6" },
  { label: "Clients", icon: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" },
  { label: "Carpentry", icon: "M15 12l-8.5 8.5a2.1 2.1 0 01-3-3L12 9M17.6 15L22 10.4 19.6 8 16 11.6" },
];
const SUBMODULES = {
  Tendering: ["RFQ Packages", "Tender Board", "Subcontractors", "Cost Intelligence", "Fee Proposals"],
  Operations: ["Projects", "Schedule", "Site Diary", "WHS", "Procurement"],
};
function NavIcon({ d }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );
}
function MockShell({ dept = "Tendering", subActive, children }) {
  const subs = SUBMODULES[dept] || [];
  const bottom = ["Sales", "Tender", "Ops", "Finance", "Marketing"];
  const bottomActive = dept === "Operations" ? 2 : 1;
  return (
    <div className="min-h-screen bg-page md:pl-[240px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] md:flex md:flex-col" style={{ background: "#1B2A3B" }}>
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/90 text-sm font-bold text-white">B</span>
          <span className="text-[15px] font-semibold tracking-tight text-white">Blue Leaf Hub</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map((n) => {
            const active = n.label === dept;
            return (
              <div key={n.label} className={`group relative flex items-center gap-3 px-3 py-2.5 ${active ? "text-white" : "text-white/60"}`}>
                {active && <span className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r bg-accent" />}
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${active ? "bg-white/15 text-white" : "text-white/70"}`}><NavIcon d={n.icon} /></span>
                <span className="text-[13px] font-semibold">{n.label}</span>
              </div>
            );
          })}
          <div className="mb-1 ml-12 mr-2 mt-0.5 space-y-0.5">
            {subs.map((m) => <div key={m} className={`rounded-lg px-3 py-2 text-[12.5px] font-medium ${m === subActive ? "bg-white/10 text-white" : "text-white/50"}`}>{m}</div>)}
          </div>
        </nav>
        <div className="border-t border-white/10 px-4 py-3 text-[11px] text-white/40">sam@blueleafbuilding.com.au</div>
      </aside>
      <header className="sticky top-0 z-20 border-b border-hairline bg-surface/95 backdrop-blur md:hidden">
        <div className="flex items-center gap-3 px-3 py-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg text-ink">☰</span><span className="text-[11px] text-muted">{dept}</span></div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 md:py-8">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface md:hidden">
        <div className="flex justify-around px-1 py-2">
          {bottom.map((t, i) => (
            <div key={t} className={`flex min-w-[52px] flex-col items-center gap-0.5 text-[10px] font-semibold ${i === bottomActive ? "text-primary" : "text-ink"}`}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${i === bottomActive ? "bg-primary/10 text-primary" : "text-muted"}`}><NavIcon d={NAV[i + 2]?.icon || NAV[3].icon} /></span>
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
      <strong>Mock-up — non-production.</strong> Static data, no wiring. Demonstrates the H3 Tender/RFQ + Procurement redesign direction for review only.
    </div>
  );
}

/* ─────────────────────────── mock data ─────────────────────────── */
const money = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}m` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${n}`);

const TENDER_ACTIONS = [
  { id: "a1", kind: "missing", tone: "danger", title: "Roof Plumber — no quote received", detail: "5A Gibson St · sent 9 days ago · deadline passed", badge: "Missing", chase: "Chase Apex Roofing" },
  { id: "a2", kind: "chase", tone: "danger", title: "Electrician — sent, no response (7d)", detail: "5A Gibson St · opened, not replied", badge: "Chase due" },
  { id: "a3", kind: "missing", tone: "warning", title: "Tiler — 1 of 3 quotes in", detail: "24 Naldera Cres · 2 recipients outstanding", badge: "Coverage 33%" },
  { id: "a4", kind: "ready", tone: "warning", title: "Frame package ready to award", detail: "5A Gibson St · 3 quotes in, lowest compliant flagged", badge: "Decide" },
  { id: "a5", kind: "chase", tone: "neutral", title: "Plumber — quote due Fri", detail: "11 Cliff St · sent, deadline in 2 days", badge: "Watch" },
];
const TENDER_STAGES = [
  { key: "out", label: "Out to tender", jobs: [
    { id: "j1", address: "5A Gibson St, Marino", coverage: 62, missing: 2, value: 845000, due: "Deadline passed" },
    { id: "j2", address: "11 Cliff St, Seacliff", coverage: 40, missing: 4, value: 690000, due: "Due Fri" },
  ] },
  { key: "quotes", label: "Quotes in — review", jobs: [
    { id: "j3", address: "24 Naldera Cres, Glenelg", coverage: 88, missing: 1, value: 512000, due: "Ready to award" },
  ] },
  { key: "won", label: "Won (last 30d)", jobs: [
    { id: "j4", address: "9 Beulah Rd, Norwood", coverage: 100, missing: 0, value: 1120000, due: "Handed to Ops" },
  ] },
];

const PACKAGE = {
  trade: "Roof Plumber", job: "5A Gibson St, Marino", coverage: "2 of 3 quotes", deadline: "Deadline passed 2 days ago",
  quotes: [
    { sub: "Apex Roofing", amount: 41500, lead: "6 wk", scope: "full", recommended: true, note: "Compliant — includes flashings" },
    { sub: "TopTier Roofing", amount: 39200, lead: "9 wk", scope: "partial", recommended: false, note: "Excludes box gutters — clarify" },
    { sub: "BuildRoof Co", amount: null, lead: "—", scope: "none", recommended: false, note: "No quote received" },
  ],
  recipients: [
    { sub: "Apex Roofing", status: "responded", at: "Quote in · 3d ago", tone: "success" },
    { sub: "TopTier Roofing", status: "responded", at: "Quote in · 5d ago", tone: "success" },
    { sub: "BuildRoof Co", status: "no_response", at: "Opened, no reply · 9d ago", tone: "danger" },
  ],
};

const PROC_ACTIONS = [
  { id: "p1", kind: "order", tone: "danger", title: "Roof trusses — order overdue", detail: "5A Gibson St · order-by 20 Jun · blocks roofing", badge: "Overdue 8d" },
  { id: "p2", kind: "selection", tone: "warning", title: "Splashback tiles — selection not confirmed", detail: "24 Naldera Cres · client decision blocks order", badge: "Blocked" },
  { id: "p3", kind: "order", tone: "warning", title: "Windows — order by Fri", detail: "11 Cliff St · 4 wk lead · fixing 1 Aug", badge: "Due 3d" },
  { id: "p4", kind: "longlead", tone: "neutral", title: "Structural steel — long lead (10 wk)", detail: "9 Beulah Rd · order within 2 weeks", badge: "Watch" },
];
const PROC_REGISTER = [
  { item: "Roof trusses", supplier: "Truss Co", orderBy: "20 Jun", risk: "Overdue", tone: "danger" },
  { item: "Windows & doors", supplier: "Stegbar", orderBy: "4 Jul", risk: "Due soon", tone: "warning" },
  { item: "Splashback tiles", supplier: "—", orderBy: "—", risk: "Selection", tone: "blocked" },
  { item: "Structural steel", supplier: "SA Steel", orderBy: "12 Jul", risk: "Long lead", tone: "neutral" },
  { item: "Insulation", supplier: "Bradford", orderBy: "25 Jul", risk: "On track", tone: "success" },
];
const KIND_ICON = { missing: "📭", chase: "📞", ready: "✅", order: "📦", selection: "🎨", longlead: "⏳" };

function ActionRow({ a, cta }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-hairline bg-surface p-3">
      <span className="mt-0.5 text-lg leading-none">{KIND_ICON[a.kind] || "•"}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-ink">{a.title}</span><StatusBadge variant={a.tone === "neutral" ? "neutral" : a.tone}>{a.badge}</StatusBadge></div>
        <div className="mt-0.5 truncate text-xs text-muted">{a.detail}</div>
      </div>
      <button className="shrink-0 self-center rounded-lg border border-hairline px-2.5 py-1 text-[11px] font-semibold text-primary">{cta || (a.chase ? a.chase : "Open →")}</button>
    </div>
  );
}

/* ─────────────────────────── VIEW 1 — Tender/RFQ home ─────────────────────────── */
function TenderHome() {
  const [view, setView] = useState("board");
  const views = [
    { value: "board", label: "Board" },
    { value: "actions", label: "Actions", count: TENDER_ACTIONS.length },
    { value: "list", label: "List" },
    { value: "scorecard", label: "Scorecard" },
  ];
  return (
    <>
      <MockBanner />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-lg font-bold text-ink">Tendering</h1><p className="text-xs text-muted">What&rsquo;s missing · who to chase · what&rsquo;s ready to award</p></div>
        <div className="flex gap-2"><button className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink">New RFQ package</button><button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">+ Send RFQs</button></div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Active tenders" value="3" sub="out to market" tone="primary" />
        <KpiCard label="Packages out" value="5" sub="awaiting quotes" />
        <KpiCard label="Missing quotes" value="6" sub="across packages" tone="danger" />
        <KpiCard label="Chases due" value="2" sub="no response" tone="warning" />
        <KpiCard label="Ready to award" value="1" sub="quotes complete" tone="success" />
      </div>
      <div className="mt-4"><FilterChips options={views} value={view} onChange={setView} /></div>

      {/* DESKTOP: Action Queue + board by stage */}
      <div className="mt-4 hidden gap-5 lg:grid lg:grid-cols-[340px_minmax(0,1fr)]">
        <SectionCard title="Needs action now" desc="Missing quotes · chases due · ready to award">
          <div className="space-y-2">{TENDER_ACTIONS.map((a) => <ActionRow key={a.id} a={a} />)}</div>
        </SectionCard>
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Jobs by tender stage</h2>
          <div className="space-y-4">
            {TENDER_STAGES.map((s) => (
              <div key={s.key}>
                <div className="mb-1.5 flex items-center gap-2"><h3 className="text-sm font-semibold text-ink">{s.label}</h3><StatusBadge variant="stage">{s.jobs.length}</StatusBadge></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {s.jobs.map((j) => (
                    <div key={j.id} className="rounded-card border border-hairline bg-surface p-4">
                      <div className="flex items-start justify-between gap-2"><h4 className="text-sm font-bold text-primary">{j.address}</h4><StatusBadge variant="money">{money(j.value)}</StatusBadge></div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-page"><div className="h-full rounded-full bg-primary" style={{ width: `${j.coverage}%` }} /></div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs"><span className="text-muted">{j.coverage}% quote coverage</span>{j.missing > 0 ? <StatusBadge variant="danger">{j.missing} missing</StatusBadge> : <StatusBadge variant="success">complete</StatusBadge>}</div>
                      <div className="mt-1.5 text-[11px] text-muted">{j.due}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MOBILE: action queue first, then stacked jobs */}
      <div className="mt-4 space-y-4 lg:hidden">
        <SectionCard title="Needs action now" desc="Missing quotes · chases due"><div className="space-y-2">{TENDER_ACTIONS.map((a) => <ActionRow key={a.id} a={a} />)}</div></SectionCard>
        {TENDER_STAGES.map((s) => (
          <div key={s.key}>
            <div className="mb-1.5 flex items-center gap-2"><h3 className="text-sm font-semibold text-ink">{s.label}</h3><StatusBadge variant="stage">{s.jobs.length}</StatusBadge></div>
            <div className="space-y-3">
              {s.jobs.map((j) => (
                <div key={j.id} className="rounded-card border border-hairline bg-surface p-4">
                  <div className="flex items-start justify-between gap-2"><h4 className="text-sm font-bold text-primary">{j.address}</h4><StatusBadge variant="money">{money(j.value)}</StatusBadge></div>
                  <div className="mt-2 flex items-center justify-between text-xs"><span className="text-muted">{j.coverage}% coverage</span>{j.missing > 0 ? <StatusBadge variant="danger">{j.missing} missing</StatusBadge> : <StatusBadge variant="success">complete</StatusBadge>}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ─────────────────────────── VIEW 2 — RFQ package detail ─────────────────────────── */
function QuoteCompare() {
  return (
    <SectionCard title="Quote comparison" desc="Lowest compliant flagged; clarify partial scope before awarding">
      <div className="space-y-2">
        {PACKAGE.quotes.map((q) => (
          <div key={q.sub} className={`rounded-lg border p-3 ${q.recommended ? "border-accent/40 bg-accent/[0.04]" : "border-hairline bg-surface"}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2"><span className="text-sm font-semibold text-ink">{q.sub}</span>{q.recommended ? <StatusBadge variant="success" dot>Recommended</StatusBadge> : null}{q.scope === "partial" ? <StatusBadge variant="warning">Partial scope</StatusBadge> : null}{q.scope === "none" ? <StatusBadge variant="danger">No quote</StatusBadge> : null}</div>
              <span className="text-sm font-bold text-ink">{q.amount ? money(q.amount) : "—"}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted"><span>{q.note}</span><span>Lead {q.lead}</span></div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
function RecipientRail() {
  return (
    <SectionCard title="Recipients & chase status">
      <div className="space-y-2">
        {PACKAGE.recipients.map((r) => (
          <div key={r.sub} className="flex items-center justify-between gap-2 rounded-lg border border-hairline px-3 py-2">
            <div className="min-w-0"><div className="truncate text-sm font-medium text-ink">{r.sub}</div><div className="text-[11px] text-muted">{r.at}</div></div>
            <StatusBadge variant={r.tone}>{r.status === "no_response" ? "No response" : "Quote in"}</StatusBadge>
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
      <p className="mt-1 text-sm text-ink">BuildRoof Co opened but never quoted (9 days). Chase or award to Apex (compliant).</p>
      <button className="mt-3 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white">Chase BuildRoof Co →</button>
      <button className="mt-2 w-full rounded-lg border border-hairline px-4 py-2 text-sm font-semibold text-ink">Award to Apex Roofing</button>
    </SectionCard>
  );
}
function PackageDetail() {
  const [tab, setTab] = useState("quotes");
  const tabs = [{ value: "quotes", label: "Quotes" }, { value: "recipients", label: "Recipients" }, { value: "scope", label: "Scope" }, { value: "addenda", label: "Addenda" }];
  return (
    <>
      <MockBanner />
      <div className="sticky top-0 z-10 -mx-4 border-b border-hairline bg-surface/95 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><span className="truncate text-base font-bold text-ink">{PACKAGE.trade} — RFQ package</span><StatusBadge variant="danger">Quote missing</StatusBadge></div>
            <div className="truncate text-xs text-muted">{PACKAGE.job} · {PACKAGE.coverage} · {PACKAGE.deadline}</div>
          </div>
          <button className="hidden shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white lg:block">Award package →</button>
        </div>
      </div>
      {/* DESKTOP command-centre */}
      <div className="mt-4 hidden gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4"><QuoteCompare /><SectionCard title="Scope"><p className="text-sm text-muted">Roof plumbing to engineer&rsquo;s detail: cladding, flashings, box gutters, downpipes. Partial quotes must clarify box-gutter inclusion before award.</p></SectionCard></div>
        <div className="space-y-4 self-start lg:sticky lg:top-28"><NextActionCard /><RecipientRail /></div>
      </div>
      {/* MOBILE tabs + sticky */}
      <div className="mt-4 lg:hidden">
        <MobileTabs tabs={tabs} value={tab} onChange={setTab} />
        <div className="mt-3 space-y-4">
          {tab === "quotes" && <><NextActionCard /><QuoteCompare /></>}
          {tab === "recipients" && <RecipientRail />}
          {tab === "scope" && <SectionCard title="Scope"><p className="text-sm text-muted">Cladding, flashings, box gutters, downpipes. Clarify box-gutter inclusion on partial quotes.</p></SectionCard>}
          {tab === "addenda" && <EmptyState compact title="No addenda" hint="Issued addenda will appear here." />}
        </div>
        <StickyActionBar position="fixed" className="!bottom-[60px] md:!bottom-0"><button className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white">Award package →</button></StickyActionBar>
        <SafeBottomSpacer height={140} />
      </div>
    </>
  );
}

/* ─────────────────────────── VIEW 3 — Procurement ─────────────────────────── */
function ProcurementView() {
  const [tab, setTab] = useState("queue");
  const tabs = [{ value: "queue", label: "Action queue" }, { value: "register", label: "Register" }, { value: "calendar", label: "Calendar" }, { value: "board", label: "Board" }];
  const queue = (
    <SectionCard title="Order before it delays the job" desc="Ranked: overdue → due-soon → selection-blocked → long-lead watch">
      <div className="space-y-2">{PROC_ACTIONS.map((a) => <ActionRow key={a.id} a={a} cta={a.kind === "order" ? "Draft PO" : a.kind === "selection" ? "Open selection" : "Open →"} />)}</div>
    </SectionCard>
  );
  const register = (
    <SectionCard title="Procurement register" desc="Sorted by order-by date">
      <div className="hidden overflow-x-auto rounded-lg border border-hairline sm:block">
        <table className="w-full text-left text-sm">
          <thead className="section-label border-b border-hairline bg-page"><tr>{["Item", "Supplier", "Order by", "Risk"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>{PROC_REGISTER.map((r) => (<tr key={r.item} className="border-b border-hairline"><td className="px-3 py-2 font-medium text-ink">{r.item}</td><td className="px-3 py-2 text-muted">{r.supplier}</td><td className="px-3 py-2 text-muted">{r.orderBy}</td><td className="px-3 py-2"><StatusBadge variant={r.tone}>{r.risk}</StatusBadge></td></tr>))}</tbody>
        </table>
      </div>
      {/* mobile: cards not a squeezed table */}
      <div className="space-y-2 sm:hidden">{PROC_REGISTER.map((r) => (<div key={r.item} className="flex items-center justify-between gap-2 rounded-lg border border-hairline px-3 py-2"><div className="min-w-0"><div className="truncate text-sm font-medium text-ink">{r.item}</div><div className="text-[11px] text-muted">{r.supplier} · order by {r.orderBy}</div></div><StatusBadge variant={r.tone}>{r.risk}</StatusBadge></div>))}</div>
    </SectionCard>
  );
  return (
    <>
      <MockBanner />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-lg font-bold text-ink">Procurement</h1><p className="text-xs text-muted">What must be ordered before it delays the job</p></div>
        <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">+ Add order</button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Active orders" value="18" sub="across jobs" tone="primary" />
        <KpiCard label="Overdue" value="1" sub="past order-by" tone="danger" />
        <KpiCard label="Due soon" value="3" sub="next 7 days" tone="warning" />
        <KpiCard label="Selection-blocked" value="1" sub="awaiting client" tone="danger" />
        <KpiCard label="Long-lead watch" value="2" sub="order within 2 wk" />
      </div>
      {/* DESKTOP: queue + register */}
      <div className="mt-4 hidden gap-5 lg:grid lg:grid-cols-[360px_minmax(0,1fr)]">
        <div>{queue}</div>
        <div>{register}</div>
      </div>
      {/* MOBILE: tabs, action queue default (lookahead list, not a table) */}
      <div className="mt-4 lg:hidden">
        <MobileTabs tabs={tabs} value={tab} onChange={setTab} />
        <div className="mt-3 space-y-4">
          {tab === "queue" && queue}
          {tab === "register" && register}
          {tab === "calendar" && <SectionCard title="Order calendar"><EmptyState compact title="Calendar view" hint="Order-by + delivery dates on a month grid." /></SectionCard>}
          {tab === "board" && <SectionCard title="Order board"><EmptyState compact title="Status board" hint="To order → ordered → delivered lanes." /></SectionCard>}
        </div>
        <StickyActionBar position="fixed" className="!bottom-[60px] md:!bottom-0"><button className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white">Draft next PO →</button></StickyActionBar>
        <SafeBottomSpacer height={140} />
      </div>
    </>
  );
}

/* ─────────────────────────── router ─────────────────────────── */
export default function H3RedesignMockup() {
  const { pathname } = useLocation();
  useEffect(() => { document.documentElement.setAttribute("data-ui-review-ready", "true"); }, [pathname]);
  let view = "home";
  if (pathname.endsWith("/procurement")) view = "procurement";
  else if (pathname.endsWith("/package")) view = "package";
  const dept = view === "procurement" ? "Operations" : "Tendering";
  const subActive = view === "procurement" ? "Procurement" : "RFQ Packages";
  return (
    <div data-ui-review-ready="true">
      <MockShell dept={dept} subActive={subActive}>
        {view === "home" && <TenderHome />}
        {view === "package" && <PackageDetail />}
        {view === "procurement" && <ProcurementView />}
      </MockShell>
    </div>
  );
}

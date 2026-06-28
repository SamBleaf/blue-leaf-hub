// Pure helpers for the Tender/RFQ home (H3-A). No fetches/side effects. Derives coverage, the
// Action Queue (missing quotes / chases due / ready to award), and stage grouping from the board's
// job+rfqs shape (id, address, status, created_at, rfqs[{status, sent_at, received_at}]).

export const STATUS_META = {
  tendering: { label: "Tendering", variant: "warning" },
  won: { label: "Won", variant: "success" },
  lost: { label: "Lost", variant: "danger" },
  archived: { label: "Archived", variant: "neutral" },
};

export function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

const GOT = (r) => r.status === "received" || r.status === "accepted";

export function rfqStats(job) {
  const rfqs = job.rfqs || [];
  const total = rfqs.length;
  const got = rfqs.filter(GOT).length;
  const coverage = total ? Math.round((got / total) * 100) : 0;
  const now = Date.now();
  const missing = rfqs.filter((r) => r.status === "sent" && !r.received_at);
  const chase = missing.filter((r) => r.sent_at && (now - new Date(r.sent_at).getTime()) / 86400000 >= 7);
  const accepted = rfqs.filter((r) => r.status === "accepted").length;
  const ready = total > 0 && got === total && job.status === "tendering";
  return { total, got, coverage, missing: missing.length, chase: chase.length, accepted, ready };
}

export function computeTenderKpis(jobs = []) {
  const active = jobs.filter((j) => j.status === "tendering");
  let missing = 0, chase = 0, ready = 0;
  for (const j of active) { const s = rfqStats(j); missing += s.missing; chase += s.chase; if (s.ready) ready += 1; }
  return { active: active.length, missing, chase, ready, won: jobs.filter((j) => j.status === "won").length };
}

export const ACTION_ICON = { missing: "📭", chase: "📞", ready: "✅" };

export function buildTenderActionQueue(jobs = []) {
  const out = [];
  for (const j of jobs.filter((x) => x.status === "tendering")) {
    const s = rfqStats(j);
    if (s.chase > 0) out.push({ id: `chase-${j.id}`, jobId: j.id, kind: "chase", tone: "danger", title: `${s.chase} chase${s.chase !== 1 ? "s" : ""} due`, detail: `${j.address} · sent, no response`, badge: "Chase due" });
    const outstanding = s.missing - s.chase;
    if (outstanding > 0) out.push({ id: `miss-${j.id}`, jobId: j.id, kind: "missing", tone: "warning", title: `${outstanding} quote${outstanding !== 1 ? "s" : ""} outstanding`, detail: j.address, badge: `Coverage ${s.coverage}%` });
    if (s.ready) out.push({ id: `ready-${j.id}`, jobId: j.id, kind: "ready", tone: "success", title: "Ready to award", detail: `${j.address} · all quotes in`, badge: "Decide" });
  }
  const rank = { danger: 0, warning: 1, success: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

const STAGES = [
  { key: "tendering", label: "Out to tender", variant: "warning" },
  { key: "won", label: "Won", variant: "success" },
  { key: "lost", label: "Lost", variant: "danger" },
  { key: "archived", label: "Archived", variant: "neutral" },
];
export function groupByStage(jobs = []) {
  return STAGES.map((s) => ({ ...s, items: jobs.filter((j) => j.status === s.key) })).filter((g) => g.items.length);
}

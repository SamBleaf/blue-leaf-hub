// Pure helpers for the Operations module home (H2-A1). No fetches, no side effects.
// Derives KPIs, the Operations Action Queue, risk grouping, and health metadata from the
// real /api/operations/projects + /api/operations/trade-conflicts shapes. Presentational
// components import from here; the page owns all data/handlers.

export const PROJECT_COLORS = [
  "#006c9b", "#2E6B4F", "#ea580c", "#1e40af", "#7c3aed",
  "#0d9488", "#d97706", "#e11d48", "#65a30d", "#b45309",
];

export function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

// schedule.health is "green" | "amber" | "red" (server-derived from overdue count).
export function healthMeta(health) {
  if (health === "red") return { key: "red", label: "Behind", variant: "danger", dot: "bg-red-500" };
  if (health === "amber") return { key: "amber", label: "Attention", variant: "warning", dot: "bg-amber-400" };
  return { key: "green", label: "On track", variant: "success", dot: "bg-green-400" };
}

export function computeOpsKpis(projects = []) {
  const byHealth = (h) => projects.filter((p) => (p.schedule?.health || "green") === h).length;
  return {
    active: projects.length,
    onTrack: byHealth("green"),
    atRisk: byHealth("amber"),
    behind: byHealth("red"),
    overdue: projects.reduce((s, p) => s + (p.schedule?.overdue || 0), 0),
  };
}

const RISK_GROUPS = [
  { key: "red", label: "Behind", variant: "danger" },
  { key: "amber", label: "Needs attention", variant: "warning" },
  { key: "green", label: "On track", variant: "success" },
];

// Projects grouped by risk (behind → attention → on track); empty groups dropped.
export function groupProjectsByRisk(projects = []) {
  return RISK_GROUPS
    .map((g) => ({ ...g, items: projects.filter((p) => (p.schedule?.health || "green") === g.key) }))
    .filter((g) => g.items.length);
}

// Ranked Operations Action Queue built only from real signals:
// overdue tasks per project (danger) → trade conflicts (warning) → projects with no schedule (setup).
export function buildOpsActionQueue(projects = [], conflicts = []) {
  const actions = [];

  projects
    .filter((p) => (p.schedule?.overdue || 0) > 0)
    .sort((a, b) => (b.schedule.overdue || 0) - (a.schedule.overdue || 0))
    .forEach((p) => {
      const od = p.schedule.overdue;
      actions.push({
        id: `od-${p.id}`, kind: "overdue", tone: "danger", projectId: p.id, project: p.address,
        title: `${od} overdue task${od !== 1 ? "s" : ""}`,
        detail: healthMeta(p.schedule.health).label, badge: "Overdue",
      });
    });

  (conflicts || []).forEach((c) => {
    const addrs = (c.projects || []).map((p) => p.address);
    actions.push({
      id: `tc-${c.trade}`, kind: "conflict", tone: "warning", projectId: c.projects?.[0]?.id,
      project: addrs.join(" & "),
      title: `${c.trade} double-booked`,
      detail: `${addrs.length} projects on overlapping dates`, badge: "Conflict",
    });
  });

  projects
    .filter((p) => (p.schedule?.total || 0) === 0)
    .forEach((p) => {
      actions.push({
        id: `ns-${p.id}`, kind: "no_schedule", tone: "neutral", projectId: p.id, project: p.address,
        title: "No schedule yet", detail: "Add a schedule to track this build", badge: "Setup",
      });
    });

  return actions;
}

export const ACTION_ICON = { overdue: "⏰", conflict: "⚠", no_schedule: "🗓" };

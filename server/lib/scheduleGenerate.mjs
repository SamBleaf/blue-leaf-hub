import { addDaysYmd } from "./dateYmd.mjs";
import { slugPhase } from "./scheduleCategories.mjs";

const PHASES = ["site_prep", "substructure", "frame", "rough_in", "lock_up", "fitout", "completion"];

function addDays(isoDate, days) {
  return addDaysYmd(isoDate, days);
}

const RAW = [
  ["Site establishment & fencing", "Site", "site_prep", 3, false, 0, []],
  ["Demolition (if applicable)", "Demolition", "site_prep", 5, false, 0, ["Site establishment & fencing"]],
  ["Excavation & earthworks", "Excavation", "site_prep", 4, false, 0, ["Demolition (if applicable)"]],
  ["Service connections", "Services", "site_prep", 2, false, 0, ["Excavation & earthworks"]],
  ["Termite protection (pre-slab)", "Termite", "substructure", 1, false, 0, ["Service connections"]],
  ["Footings & beams", "Concrete", "substructure", 4, false, 0, ["Site establishment & fencing"]],
  ["Hold point: Footing inspection", "Concrete", "substructure", 0, true, 0, ["Footings & beams"]],
  ["In-slab plumbing rough-in", "Plumbing", "substructure", 2, false, 0, ["Hold point: Footing inspection"]],
  ["Slab pour", "Concrete", "substructure", 2, false, 0, ["In-slab plumbing rough-in"]],
  ["Hold point: Slab inspection", "Concrete", "substructure", 0, true, 0, ["Slab pour"]],
  ["Slab cure (7 days)", "Concrete", "substructure", 7, false, 0, ["Hold point: Slab inspection"]],
  ["Structural steel", "Steel", "frame", 5, false, 35, ["Slab cure (7 days)"]],
  ["Wall & roof frame", "Carpentry", "frame", 10, false, 0, ["Slab cure (7 days)"]],
  ["Hold point: Frame inspection", "Carpentry", "frame", 0, true, 0, ["Wall & roof frame", "Structural steel", "Roof trusses"]],
  ["Roof trusses", "Carpentry", "frame", 3, false, 14, ["Slab cure (7 days)"]],
  ["Plumbing rough-in", "Plumbing", "rough_in", 5, false, 0, ["Hold point: Frame inspection"]],
  ["Electrical rough-in", "Electrical", "rough_in", 5, false, 0, ["Hold point: Frame inspection"]],
  ["A/C rough-in", "HVAC", "rough_in", 4, false, 0, ["Hold point: Frame inspection"]],
  ["Insulation", "Insulation", "rough_in", 2, false, 0, ["Hold point: Frame inspection"]],
  ["→ [Order windows now - 14 week lead]", "Joinery", "rough_in", 0, false, 98, ["Hold point: Frame inspection"]],
  ["→ [Order joinery now - 8 week lead]", "Joinery", "rough_in", 0, false, 56, ["Hold point: Frame inspection"]],
  ["Hold point: Rough-in inspection", "Site", "rough_in", 0, true, 0, [
    "Plumbing rough-in",
    "Electrical rough-in",
    "A/C rough-in",
    "Insulation",
    "→ [Order windows now - 14 week lead]",
    "→ [Order joinery now - 8 week lead]"
  ]],
  ["Roof plumbing & metal roofing", "Roofing", "lock_up", 6, false, 0, ["Hold point: Frame inspection"]],
  ["External cladding & brickwork", "Brickwork", "lock_up", 10, false, 21, ["Hold point: Frame inspection"]],
  ["Windows & glazing", "Glazing", "lock_up", 4, false, 98, ["Roof plumbing & metal roofing"]],
  ["External doors & garage door", "Carpentry", "lock_up", 2, false, 42, ["Windows & glazing"]],
  ["Fascia, gutters & downpipes", "Roofing", "lock_up", 3, false, 0, ["Roof plumbing & metal roofing"]],
  ["External render (scratch coat)", "Rendering", "lock_up", 3, false, 0, ["External cladding & brickwork"]],
  ["Hold point: Lock-up inspection", "Site", "lock_up", 0, true, 0, ["Windows & glazing", "External doors & garage door", "Fascia, gutters & downpipes"]],
  ["Plasterboard supply & fix", "Plastering", "fitout", 8, false, 0, ["Hold point: Rough-in inspection"]],
  ["Internal plaster & cornice", "Plastering", "fitout", 5, false, 0, ["Plasterboard supply & fix"]],
  ["Painting — first coat", "Painting", "fitout", 4, false, 0, ["Internal plaster & cornice"]],
  ["Tiling", "Tiling", "fitout", 7, false, 0, ["Plasterboard supply & fix"]],
  ["Joinery & cabinetry install", "Joinery", "fitout", 5, false, 56, ["Painting — first coat", "Tiling"]],
  ["Painting — final coat", "Painting", "fitout", 4, false, 0, ["Joinery & cabinetry install"]],
  ["Flooring", "Flooring", "fitout", 4, false, 28, ["Painting — final coat"]],
  ["Stairs", "Carpentry", "fitout", 3, false, 28, ["Painting — final coat"]],
  ["Electrical fit-off", "Electrical", "fitout", 3, false, 0, ["Painting — final coat"]],
  ["Plumbing fit-off", "Plumbing", "fitout", 3, false, 0, ["Tiling"]],
  ["A/C fit-off & commissioning", "HVAC", "fitout", 2, false, 0, ["Painting — final coat"]],
  ["Shower screens & mirrors", "Glazing", "fitout", 2, false, 21, ["Painting — final coat"]],
  ["Door hardware & second fix", "Carpentry", "fitout", 2, false, 0, ["Painting — final coat"]],
  ["Appliances", "Electrical", "fitout", 1, false, 42, ["Painting — final coat"]],
  [
    "Hold point: PCI inspection",
    "Site",
    "fitout",
    0,
    true,
    0,
    [
      "Joinery & cabinetry install",
      "Painting — final coat",
      "Flooring",
      "Electrical fit-off",
      "Plumbing fit-off",
      "A/C fit-off & commissioning",
      "Stairs",
      "Shower screens & mirrors",
      "Door hardware & second fix",
      "Appliances"
    ]
  ],
  ["Final clean", "Site", "completion", 2, false, 0, ["Hold point: PCI inspection"]],
  ["Landscaping", "Landscaping", "completion", 5, false, 0, ["Hold point: PCI inspection"]],
  ["Driveway & paving", "Concrete", "completion", 3, false, 0, ["Hold point: PCI inspection"]],
  ["Defect rectification", "Site", "completion", 3, false, 0, ["Hold point: PCI inspection"]],
  ["Hold point: Practical completion", "Site", "completion", 0, true, 0, ["Final clean", "Landscaping", "Driveway & paving", "Defect rectification"]]
];

function normTrade(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tradeMatchesAccepted(taskTrade, accepted) {
  const tt = normTrade(taskTrade);
  if (!accepted.length) return false;
  for (const row of accepted) {
    const t = normTrade(typeof row === "string" ? row : row?.trade || "");
    if (!t) continue;
    if (tt.includes(t) || t.includes(tt)) return true;
  }
  return false;
}

function shouldIncludeTask(row, accepted, excludeNames) {
  if (excludeNames.has(row.name)) return false;
  if (row.is_hold_point) return true;
  if (row.phase === "site_prep" || row.phase === "substructure") return true;
  if (row.name.startsWith("→") || row.name.startsWith("\u2192")) return true;
  return tradeMatchesAccepted(row.trade, accepted);
}

function topoSort(names, nameToRow, edgesFrom) {
  const visited = new Set();
  const order = [];
  function visit(n) {
    if (visited.has(n)) return;
    visited.add(n);
    const preds = edgesFrom.get(n) || [];
    for (const p of preds) {
      if (nameToRow.has(p)) visit(p);
    }
    order.push(n);
  }
  for (const n of names) visit(n);
  return order;
}

/**
 * @param {string} projectId
 * @param {string} startDate YYYY-MM-DD
 * @param {object[]} acceptedTrades
 * @param {{ excludeNames?: string[] }} opts
 * @returns {object[]} rows ready for insert (no id)
 */
export function buildScheduleRowsForInsert(projectId, startDate, acceptedTrades, opts = {}) {
  const excludeNames = new Set((opts.excludeNames || []).map(String));
  const accepted = Array.isArray(acceptedTrades) ? acceptedTrades : [];

  const rows = RAW.map(([name, trade, phase, duration_days, is_hold_point, procurement_lead_days, depNames]) => ({
    name,
    trade,
    phase,
    duration_days,
    is_hold_point,
    procurement_lead_days: procurement_lead_days || null,
    dependsOnNames: depNames
  })).filter((r) => shouldIncludeTask(r, accepted, excludeNames));

  const nameToRow = new Map(rows.map((r) => [r.name, r]));
  const names = rows.map((r) => r.name);

  const edgesFrom = new Map();
  for (const r of rows) {
    edgesFrom.set(r.name, r.dependsOnNames.filter((d) => nameToRow.has(d)));
  }

  const sorted = topoSort(names, nameToRow, edgesFrom);

  const endByName = new Map();

  for (const name of sorted) {
    const r = nameToRow.get(name);
    const preds = (r.dependsOnNames || []).filter((d) => nameToRow.has(d));
    let start;
    if (!preds.length) {
      start = startDate;
    } else {
      let maxEnd = startDate;
      for (const p of preds) {
        const e = endByName.get(p);
        if (e && e > maxEnd) maxEnd = e;
      }
      start = addDays(maxEnd, 1);
    }
    let end;
    if (r.duration_days <= 0) {
      end = start;
    } else {
      end = addDays(start, r.duration_days - 1);
    }
    endByName.set(name, end);

    let order_by_date = null;
    if (r.procurement_lead_days && r.procurement_lead_days > 0) {
      order_by_date = addDays(start, -r.procurement_lead_days);
    }

    r._start = start;
    r._end = end;
    r._order_by = order_by_date;
    r._depends_names = preds;
  }

  return sorted.map((name) => {
    const r = nameToRow.get(name);
    return {
      project_id: projectId,
      name: r.name,
      trade: r.trade,
      phase: r.phase,
      start_date: r._start,
      end_date: r._end,
      duration_days: Math.max(0, r.duration_days),
      depends_on: [],
      status: "planned",
      is_hold_point: r.is_hold_point,
      procurement_lead_days: r.procurement_lead_days,
      order_by_date: r._order_by,
      notes: null,
      assigned_subcontractor_id: null,
      _depends_names: r._depends_names
    };
  });
}

export function attachDependsOnUuids(insertedRows, insertedWithIds) {
  const nameToId = new Map();
  for (let i = 0; i < insertedRows.length; i++) {
    nameToId.set(insertedRows[i].name, insertedWithIds[i].id);
  }
  return insertedRows.map((r, i) => {
    const deps = (r._depends_names || []).map((n) => nameToId.get(n)).filter(Boolean);
    return { id: insertedWithIds[i].id, depends_on: deps };
  });
}

/** Topological order for Claude temp task ids. Supports both task_dependencies and legacy depends_on. */
export function topoSortClaudeTasks(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  const byId = new Map(list.map((t) => [String(t.id), t]));
  const visited = new Set();
  const out = [];
  function visit(id) {
    const sid = String(id);
    if (visited.has(sid)) return;
    visited.add(sid);
    const node = byId.get(sid);
    if (!node) return;
    // Support new task_dependencies format and legacy depends_on
    const predIds = Array.isArray(node.task_dependencies) && node.task_dependencies.length > 0
      ? node.task_dependencies.map((d) => String(d.taskId))
      : (node.depends_on || []).map(String);
    for (const d of predIds) visit(d);
    out.push(node);
  }
  for (const t of list) visit(String(t.id));
  return out;
}

function phaseForCategory(catLabel, categoryBlocks) {
  const k = String(catLabel || "")
    .trim()
    .toLowerCase();
  if (!k) return "general";
  for (const b of categoryBlocks || []) {
    const pl = String(b.phaseLabel || "").toLowerCase();
    if (pl === k) return b.phase;
    if (pl && (k.includes(pl) || pl.includes(k))) return b.phase;
  }
  return slugPhase(catLabel);
}

function normWords(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyNameScore(a, b) {
  const aa = new Set(normWords(a).split(" ").filter((w) => w.length > 2));
  const bb = new Set(normWords(b).split(" ").filter((w) => w.length > 2));
  if (!aa.size || !bb.size) return 0;
  let hits = 0;
  for (const w of aa) if (bb.has(w)) hits += 1;
  return hits / Math.max(aa.size, bb.size);
}

function findScheduleHint(taskName, phase, scheduleHints = []) {
  let best = null;
  for (const hint of scheduleHints || []) {
    const dur = Number(hint?.duration_days);
    if (!Number.isFinite(dur) || dur <= 0) continue;
    const phaseScore = phase && hint?.phase && normWords(phase) === normWords(hint.phase) ? 0.35 : 0;
    const score = phaseScore + fuzzyNameScore(taskName, hint.task_name);
    if (score >= 0.45 && (!best || score > best.score)) best = { hint, score };
  }
  return best?.hint || null;
}

/**
 * Build insert rows from Claude JSON tasks (with temp ids + _depends_temp).
 */
export function buildRowsFromClaudePlan(projectId, startDate, claudeTasks, categoryBlocks, opts = {}) {
  const sorted = topoSortClaudeTasks(claudeTasks);
  const tempToEnd = new Map();
  const rows = [];
  const scheduleHints = Array.isArray(opts.scheduleHints) ? opts.scheduleHints : [];
  for (const t of sorted) {
    const tid = String(t.id);
    // Support both new task_dependencies and legacy depends_on for scheduling
    const predTempIds = Array.isArray(t.task_dependencies) && t.task_dependencies.length > 0
      ? t.task_dependencies.map((d) => String(d.taskId)).filter((id) => tempToEnd.has(id))
      : (t.depends_on || []).map(String).filter((id) => tempToEnd.has(id));

    let start = startDate;
    if (predTempIds.length) {
      let maxEnd = startDate;
      for (const p of predTempIds) {
        const e = tempToEnd.get(p);
        if (e && e > maxEnd) maxEnd = e;
      }
      start = addDaysYmd(maxEnd, 1);
    }
    const phase = phaseForCategory(t.category, categoryBlocks);
    const matchedHint = findScheduleHint(t.name, phase, scheduleHints);
    if (matchedHint) {
      console.log(`[schedule] using Buildexact duration for ${t.name}: ${matchedHint.duration_days} days`);
    }

    // New schema uses duration_days directly; fall back to duration_weeks for backward compat
    const taskType = String(t.task_type || "build");
    const isGate = taskType === "approval" || taskType === "inspection" || taskType === "milestone";
    let duration_days;
    if (matchedHint) {
      duration_days = Math.max(1, Math.round(Number(matchedHint.duration_days)));
    } else if (Number.isFinite(Number(t.duration_days)) && Number(t.duration_days) >= 0) {
      duration_days = isGate ? 0 : Math.max(1, Math.round(Number(t.duration_days)));
    } else {
      const durW = Number(t.duration_weeks);
      const isHp = Boolean(t.is_hold_point);
      duration_days = (isHp || isGate) && (!Number.isFinite(durW) || durW <= 0)
        ? 0
        : Math.max(1, Math.ceil(Math.max(Number.isFinite(durW) ? durW : 1, 0.1) * 7));
    }

    let end;
    if (duration_days <= 0) end = start;
    else end = addDaysYmd(start, duration_days - 1);
    tempToEnd.set(tid, end);

    // lead_time_days (new) or fall back to lead_time_weeks (old)
    const leadDays = Number(t.lead_time_days) || Math.round((Number(t.lead_time_weeks) || 0) * 7);
    const procurement_lead_days = leadDays > 0 ? leadDays : null;
    const order_by_date = procurement_lead_days && duration_days > 0 ? addDaysYmd(start, -procurement_lead_days) : null;

    rows.push({
      project_id: projectId,
      name: String(t.name || "Task").slice(0, 500),
      trade: String(t.category || "General").split(/[/,&]/)[0]?.trim() || "General",
      phase,
      task_type: taskType,
      start_date: start,
      end_date: end,
      duration_days,
      depends_on: [],
      task_dependencies: [],
      status: "planned",
      is_hold_point: isGate || Boolean(t.is_hold_point),
      procurement_lead_days,
      lead_time_weeks: null,
      lead_time_days: procurement_lead_days,
      order_by_date,
      hold_point_description: t.hold_point_description ? String(t.hold_point_description).slice(0, 2000) : null,
      notes: t.notes ? String(t.notes).slice(0, 4000) : null,
      can_run_concurrent_with: [],
      is_critical_path: false,
      hold_notify: false,
      // Temp-ID arrays for post-insert UUID mapping
      _depends_temp: (t.depends_on || []).map(String),
      _task_dependencies_temp: Array.isArray(t.task_dependencies)
        ? t.task_dependencies.map((d) => ({ taskId: String(d.taskId), type: String(d.type || "FS"), lag: Number(d.lag) || 0 }))
        : [],
      _concurrent_temp: (t.can_run_concurrent_with || []).map(String),
      _temp_id: tid,
      _depends_names: []
    });
  }
  return rows;
}

/** Map temp IDs in task_dependencies to real UUIDs after insert. */
export function attachTaskDependenciesUuids(rows, insertedIdsOrdered) {
  const tempToUuid = new Map();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]._temp_id) tempToUuid.set(rows[i]._temp_id, insertedIdsOrdered[i]);
  }
  return rows.map((r, i) => {
    const taskDeps = (r._task_dependencies_temp || [])
      .map((d) => ({ taskId: tempToUuid.get(d.taskId), type: d.type, lag: d.lag }))
      .filter((d) => d.taskId);
    // Also resolve legacy depends_on temp IDs
    const deps = (r._depends_temp || []).map((x) => tempToUuid.get(String(x))).filter(Boolean);
    return { id: insertedIdsOrdered[i], task_dependencies: taskDeps, depends_on: deps };
  });
}

/** Sequential fallback when Claude is unavailable: one short task per line item. */
export function buildFallbackRowsFromCategories(projectId, startDate, categoryBlocks, opts = {}) {
  const sortedBlocks = categoryBlocks || [];
  let chainCursor = startDate;
  const out = [];
  let idx = 0;
  const scheduleHints = Array.isArray(opts.scheduleHints) ? opts.scheduleHints : [];
  for (const block of sortedBlocks) {
    const items = block.lineItems?.length ? block.lineItems : [block.phaseLabel];
    for (const line of items) {
      idx += 1;
      const tid = `fb_${idx}`;
      const start = chainCursor;
      const matchedHint = findScheduleHint(line, block.phase, scheduleHints);
      if (matchedHint) {
        console.log(`[schedule] using Buildexact duration for ${line}: ${matchedHint.duration_days} days`);
      }
      const duration_days = matchedHint ? Math.max(1, Math.round(Number(matchedHint.duration_days))) : 3;
      const end = addDaysYmd(start, duration_days - 1);
      chainCursor = addDaysYmd(end, 1);
      out.push({
        project_id: projectId,
        name: String(line).slice(0, 400),
        trade: block.phaseLabel,
        phase: block.phase,
        start_date: start,
        end_date: end,
        duration_days,
        depends_on: [],
        status: "planned",
        is_hold_point: false,
        procurement_lead_days: null,
        lead_time_weeks: null,
        order_by_date: null,
        hold_point_description: null,
        notes: null,
        can_run_concurrent_with: [],
        is_critical_path: false,
        hold_notify: false,
        _depends_temp: [],
        _concurrent_temp: [],
        _temp_id: tid,
        _depends_names: []
      });
    }
  }
  return out;
}

export function stripDynamicScheduleRow(r) {
  const { _depends_temp, _task_dependencies_temp, _concurrent_temp, _temp_id, _depends_names, ...rest } = r;
  return {
    ...rest,
    can_run_concurrent_with: Array.isArray(rest.can_run_concurrent_with) ? rest.can_run_concurrent_with : []
  };
}

export function attachDependsOnTempIds(rows, insertedIdsOrdered) {
  const tempToUuid = new Map();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]._temp_id) tempToUuid.set(rows[i]._temp_id, insertedIdsOrdered[i]);
  }
  return rows.map((r, i) => {
    const deps = (r._depends_temp || []).map((x) => tempToUuid.get(String(x))).filter(Boolean);
    return { id: insertedIdsOrdered[i], depends_on: deps };
  });
}

export function buildConcurrentUuidUpdates(rows, insertedIdsOrdered) {
  const tempToUuid = new Map();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]._temp_id) tempToUuid.set(rows[i]._temp_id, insertedIdsOrdered[i]);
  }
  return rows.map((r, i) => {
    const conc = (r._concurrent_temp || []).map((x) => tempToUuid.get(String(x))).filter(Boolean);
    return { id: insertedIdsOrdered[i], can_run_concurrent_with: conc };
  });
}

export { PHASES };

// W17-P4b — Workforce Planner job colours.
// A curated 10-colour palette; each job gets an auto colour by its position in the
// active-jobs list (no collisions among active jobs), overridable by a saved colour.

export const PLANNER_PALETTE = [
  { key: "blue",   label: "Blue",   bg: "#E6F1FB", dot: "#378ADD", text: "#0C447C" },
  { key: "teal",   label: "Teal",   bg: "#E1F5EE", dot: "#1D9E75", text: "#085041" },
  { key: "amber",  label: "Amber",  bg: "#FAEEDA", dot: "#EF9F27", text: "#633806" },
  { key: "purple", label: "Purple", bg: "#EEEDFE", dot: "#7F77DD", text: "#3C3489" },
  { key: "coral",  label: "Coral",  bg: "#FAECE7", dot: "#D85A30", text: "#712B13" },
  { key: "pink",   label: "Pink",   bg: "#FBEAF0", dot: "#D4537E", text: "#72243E" },
  { key: "green",  label: "Green",  bg: "#EAF3DE", dot: "#639922", text: "#27500A" },
  { key: "red",    label: "Red",    bg: "#FCEBEB", dot: "#E24B4A", text: "#791F1F" },
  { key: "slate",  label: "Slate",  bg: "#EEF0F2", dot: "#64748B", text: "#1E293B" },
  { key: "indigo", label: "Indigo", bg: "#E8EAF6", dot: "#5C6BC0", text: "#283593" },
];

const FALLBACK = PLANNER_PALETTE[8]; // slate — for chips with no resolvable job

export function jobKey(type, id) {
  return `${type}:${id}`;
}

function hashKey(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Auto colour key: a STABLE hash of the job key, so a job's fallback colour never changes when other
// jobs are added/removed (the old index-in-list version reshuffled every colour on add). The Planner
// allocates + persists a collision-free colour per job (nextFreeColorKey); this is only the fallback
// for a job that has no saved colour yet. `orderedKeys` kept for signature compatibility.
export function autoColorKey(key, _orderedKeys = []) {
  return PLANNER_PALETTE[hashKey(key) % PLANNER_PALETTE.length].key;
}

export function paletteByKey(colorKey) {
  return PLANNER_PALETTE.find((p) => p.key === colorKey) || FALLBACK;
}

// Next colour NOT already in use — for locking a colour to a job on first allocation. When a job is
// removed its colour drops out of `takenKeys`, so it returns to the pool for the next new job.
export function nextFreeColorKey(takenKeys) {
  const taken = takenKeys instanceof Set ? takenKeys : new Set(takenKeys || []);
  const free = PLANNER_PALETTE.find((p) => !taken.has(p.key));
  if (free) return free.key;
  return PLANNER_PALETTE[taken.size % PLANNER_PALETTE.length].key; // >10 concurrent jobs: deterministic wrap
}

// Resolve a job's palette entry: a saved colour wins, else the auto colour by order.
export function resolveJobColor(key, orderedKeys = [], savedMap = {}) {
  const colorKey = savedMap[key] || autoColorKey(key, orderedKeys);
  return paletteByKey(colorKey);
}

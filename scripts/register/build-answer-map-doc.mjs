/**
 * build-answer-map-doc.mjs — checks the Tab 21 answer map against the question library and writes its
 * readable view (R05 P3, Tab 27 Gate 0.2).
 *
 *   docs/master_register/question-library/tab21-answer-map-<v>.json   the inventory (edit this)
 *   docs/master_register/question-library/TAB21_ANSWER_MAP.md         the table people read (generated)
 *
 * Question wording and relevance are copied from src/lib/registerQuestions.js and checked here, so the map
 * can't drift from the approved library without failing.
 *
 * Run: npm run register:answer-map          (validate + write)
 *      node scripts/register/build-answer-map-doc.mjs --check   (validate + fail if the .md is out of date)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { QUESTIONS, QUESTION_LIBRARY_VERSION, ANSWER_CONFIG } from "../../src/lib/registerQuestions.js";
import { REGISTER_DISPOSITIONS, SUPPLY_BY, ROOM_PRIMARY_PROMPT_IDS, ANSWER_NATURES, ANSWER_MAP_VERSION } from "../../src/lib/register.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, "../../docs/master_register/question-library");
export const JSON_PATH = join(DIR, "tab21-answer-map-v1.0.json");
export const MD_PATH = join(DIR, "TAB21_ANSWER_MAP.md");

const MAPPINGS = ["fact_prefill", "single_select", "multi_select", "progressive_branch", "repeatable_scope", "requirement", "action_risk", "technical_only"];
const TIERS = ["essential", "more_detail", "office_only"];
const CONTROLS = ["readonly", "single", "multi", "tree", "repeat", "note"];
const DISPOSITION_USE = ["none", "element", "answer", "settled_only"];
const ID_RX = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const SELECTS = ["single", "multi", "groups"];
const OPTION_STATES = ["client_unsure", "not_applicable"];

function checkOptions(list, where, errors) {
  if (!Array.isArray(list)) { errors.push(`${where}: options must be a list`); return; }
  const seen = new Set();
  for (const o of list) {
    if (!o || !ID_RX.test(o.id || "")) errors.push(`${where}: bad option id ${JSON.stringify(o?.id)}`);
    else if (seen.has(o.id)) errors.push(`${where}: duplicate option id ${o.id}`);
    seen.add(o?.id);
    if (!String(o?.label || "").trim()) errors.push(`${where}/${o?.id}: option has no label`);
    if (o?.disposition && !(o.disposition in REGISTER_DISPOSITIONS)) errors.push(`${where}/${o.id}: unknown disposition ${o.disposition}`);
    if (o?.supplyBy && !(o.supplyBy in SUPPLY_BY)) errors.push(`${where}/${o.id}: unknown supplyBy ${o.supplyBy}`);
    if (o?.supplyBy === "client" && o?.disposition) errors.push(`${where}/${o.id}: client supply can't set a disposition while Tab 27 Q4 is open`);
    if (o?.state && !OPTION_STATES.includes(o.state)) errors.push(`${where}/${o.id}: unknown state ${o.state}`);
    if (o?.disposition === "na" && o?.state !== "not_applicable") errors.push(`${where}/${o.id}: an option that means N/A must carry the not_applicable state`);
    if (o?.children) checkOptions(o.children, `${where}/${o.id}`, errors);
  }
}

/** Every problem with a map, as plain strings. [] means it is sound. */
export function validateAnswerMap(map, questions = QUESTIONS) {
  const errors = [];
  if (map?.version !== ANSWER_MAP_VERSION) errors.push(`version ${map?.version} is not ${ANSWER_MAP_VERSION}`);
  if (map?.libraryVersion !== QUESTION_LIBRARY_VERSION) errors.push(`libraryVersion ${map?.libraryVersion} is not ${QUESTION_LIBRARY_VERSION}`);
  const entries = Array.isArray(map?.questions) ? map.questions : [];
  const byId = new Map();
  for (const e of entries) {
    if (byId.has(e.id)) errors.push(`${e.id}: listed twice`);
    byId.set(e.id, e);
  }
  for (const q of questions) if (!byId.has(q.id)) errors.push(`${q.id}: missing from the map`);
  const lib = new Map(questions.map((q) => [q.id, q]));
  for (const e of entries) {
    const q = lib.get(e.id);
    if (!q) { errors.push(`${e.id}: not in the question library`); continue; }
    if (e.text !== q.text) errors.push(`${e.id}: wording differs from Tab 21`);
    if (e.short !== q.short || e.section !== q.section || e.itemKind !== q.itemKind || e.libraryKind !== q.kind) errors.push(`${e.id}: identity differs from the library`);
    const r = e.relevance || {};
    if (r.projects !== q.projects || r.stage !== q.stage || r.optional !== q.optional || JSON.stringify(r.rooms ?? null) !== JSON.stringify(q.rooms ?? null)) errors.push(`${e.id}: relevance differs from the library`);
    if (!MAPPINGS.includes(e.mapping)) errors.push(`${e.id}: unknown mapping ${e.mapping}`);
    if (!TIERS.includes(e.tier)) errors.push(`${e.id}: unknown tier ${e.tier}`);
    if (!CONTROLS.includes(e.control)) errors.push(`${e.id}: unknown control ${e.control}`);
    if (!(e.nature in ANSWER_NATURES)) errors.push(`${e.id}: unknown nature ${e.nature}`);
    if (!DISPOSITION_USE.includes(e.disposition)) errors.push(`${e.id}: unknown disposition use ${e.disposition}`);
    if ((q.kind === "FACT" || q.prefill) && e.mapping !== "fact_prefill") errors.push(`${e.id}: Sales/project facts must stay prefilled, not asked`);
    if (e.mapping === "fact_prefill" && (e.control !== "readonly" || e.options)) errors.push(`${e.id}: a prefilled fact has no answer control`);
    if (["fact", "risk", "action", "requirement", "technical"].includes(e.nature) && e.disposition !== "none") errors.push(`${e.id}: a ${e.nature} can't use the generic work disposition`);
    if (e.mapping === "repeatable_scope" && (e.control !== "repeat" || !e.repeat?.key)) errors.push(`${e.id}: repeatable scope needs a repeat key`);
    if (["single", "multi", "tree"].includes(e.control) && !e.options && !e.inherits && !e.optionsFrom) errors.push(`${e.id}: a ${e.control} control needs options`);
    if (e.select && !SELECTS.includes(e.select)) errors.push(`${e.id}: unknown select ${e.select}`);
    if (e.childSelect && !["single", "multi"].includes(e.childSelect)) errors.push(`${e.id}: unknown childSelect ${e.childSelect}`);
    if (e.select === "groups" && !(e.options || []).some((o) => o.children)) errors.push(`${e.id}: grouped choices need at least one group with children`);
    if (e.disposition === "element" && !e.actions) errors.push(`${e.id}: an answer that sets the disposition needs actions`);
    if (e.control === "repeat" && e.repeat?.by !== "record" && !e.options && !e.actions && !e.elements) errors.push(`${e.id}: a repeated answer needs elements, actions or options`);
    if (e.family === "E" && (e.mapping !== "technical_only" || e.tier !== "office_only")) errors.push(`${e.id}: element prompts are office technical checks`);
    if (q.section === "room" && !q.detail && e.mapping !== "fact_prefill" && !e.presentedWith && (e.tier === "essential") !== ROOM_PRIMARY_PROMPT_IDS.has(q.id)) errors.push(`${e.id}: room tier disagrees with the guided primary set`);
    for (const k of ["options", "actions", "elements", "zones", "perOption"]) if (e[k]) checkOptions(e[k], `${e.id}.${k}`, errors);
    if (e.linked) checkOptions(e.linked.options, `${e.id}.linked`, errors);
    for (const [el, list] of Object.entries(e.constructionTypes || {})) {
      checkOptions(list, `${e.id}.constructionTypes.${el}`, errors);
      if (!(e.elements || []).some((x) => x.id === el)) errors.push(`${e.id}: construction types for unknown element ${el}`);
    }
    for (const k of ["presentedWith", "inherits", "optionsFrom"]) if (e[k] && !byId.has(e[k])) errors.push(`${e.id}: ${k} points at unknown ${e[k]}`);
  }
  for (const g of map?.presentationGroups || []) for (const id of [g.primary, ...(g.aliases || [])]) if (!byId.has(id)) errors.push(`group ${g.key}: unknown ${id}`);
  return errors;
}

// ── Readable view ─────────────────────────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const tree = (list) => (list || []).map((o) => (o.children ? `${o.label} (${tree(o.children)})` : o.label)).join(", ");
const appliesTo = (e) => {
  const r = e.relevance;
  const bits = [r.projects === "reno" ? "Renovation" : r.projects === "new" ? "New build" : "All projects", `stage ${r.stage}`];
  if (r.optional) bits.push("when scoped");
  if (r.overlay) bits.push("management delivery only");
  if (Array.isArray(r.rooms)) bits.push(r.rooms.join(", "));
  return bits.join("; ");
};
function optionCell(e) {
  const parts = [];
  if (e.zones) parts.push(`Zones: ${tree(e.zones)}`);
  if (e.elements) parts.push(`Elements: ${tree(e.elements)}`);
  if (e.actions) parts.push(`Actions: ${e.actions.map((a) => `${a.label} → ${a.disposition || a.supplyBy || "recorded"}`).join(", ")}`);
  if (e.options) parts.push(tree(e.options));
  if (e.perOption) parts.push(`Each: ${tree(e.perOption)}`);
  if (e.constructionTypes) parts.push(`Types: ${Object.entries(e.constructionTypes).map(([k, v]) => `${k}: ${tree(v)}`).join("; ")}`);
  if (e.linked) parts.push(`Linked ${e.linked.label}: ${tree(e.linked.options)}`);
  if (e.inherits) parts.push(`Inherits ${e.inherits}`);
  if (e.optionsFrom) parts.push(`Options from ${e.optionsFrom}`);
  if (e.presentedWith) parts.push(`Shown with ${e.presentedWith}`);
  if (e.clientNote) parts.push("Plus a note for the client");
  if (e.childrenBoundToParent) parts.push("Follow-ups never carry across to another option");
  if (e.optionSource) parts.push(`_source: ${e.optionSource}_`);
  if (e.notes) parts.push(e.notes);
  return esc(parts.join(" · ")) || "—";
}
const FAMILY_ORDER = ["P", "W", "R", "K", "B", "L", "V", "D", "H", "O", "E", "M"];

export function renderAnswerMap(map) {
  const qs = map.questions;
  const count = (key) => Object.entries(qs.reduce((m, q) => ({ ...m, [q[key]]: (m[q[key]] || 0) + 1 }), {}));
  const lines = [
    "# Tab 21 answer map", "",
    `> Generated from \`${"tab21-answer-map-v1.0.json"}\` by \`npm run register:answer-map\`. Edit the JSON, not this file.`, "",
    `**Map:** ${map.version} · **Question library:** ${map.libraryVersion} · **Questions mapped:** ${qs.length}`, "",
    map.status, "",
    "## Totals", "",
    "| Maps to | Questions | Meaning |", "|---|---|---|",
    ...MAPPINGS.map((m) => `| ${m} | ${qs.filter((q) => q.mapping === m).length} | ${esc(map.legend.mapping[m])} |`), "",
    "| Show | Questions | Meaning |", "|---|---|---|",
    ...TIERS.map((t) => `| ${t} | ${qs.filter((q) => q.tier === t).length} | ${esc(map.legend.tier[t])} |`), "",
    "| Records as | Questions |", "|---|---|",
    ...count("nature").sort().map(([k, v]) => `| ${k} | ${v} |`), "",
    "## How the work disposition is used", "",
    ...DISPOSITION_USE.map((d) => `- **${d}** (${qs.filter((q) => q.disposition === d).length}): ${map.legend.disposition[d]}`), "",
    "## How each question family is handled on screen", "",
    "Every question has one. None is left to the generic work dropdown.", "",
    "| Family | Card | Typed record with owner | Office note | Project step | Folded into another card | Prefilled, not asked |", "|---|---|---|---|---|---|---|",
    ...FAMILY_ORDER.map((fam) => {
      const n = (h) => qs.filter((q) => q.family === fam && ANSWER_CONFIG[q.id]?.handling === h).length;
      return `| ${fam} | ${n("choice")} | ${n("record")} | ${n("note")} | ${n("context")} | ${n("folded")} | ${n("prefill")} |`;
    }), "",
    "## One card, several source ids", "",
    "Presentation only. Each item keeps the Tab 21 id it was captured under.", "",
    "| Group | Leads with | Also covers | Why |", "|---|---|---|---|",
    ...map.presentationGroups.map((g) => `| ${g.key} | ${g.primary} | ${g.aliases.join(", ")} | ${esc(g.why)} |`), "",
    "## Questions", "",
  ];
  for (const fam of FAMILY_ORDER) {
    const list = qs.filter((q) => q.family === fam);
    if (!list.length) continue;
    lines.push(`### ${fam}: ${list[0].group}`, "", "| ID | Question (Tab 21 wording) | Maps to | Records as | Control | Disposition | Show | Applies to | Options and notes |", "|---|---|---|---|---|---|---|---|---|");
    for (const e of list) lines.push(`| ${e.id} | **${esc(e.short)}.** ${esc(e.text)} | ${e.mapping} | ${e.nature} | ${e.control} | ${e.disposition} | ${e.tier} | ${esc(appliesTo(e))} | ${optionCell(e)} |`);
    lines.push("");
  }
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const map = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  const errors = validateAnswerMap(map);
  if (errors.length) { console.error(`Answer map has ${errors.length} problem(s):\n  ${errors.join("\n  ")}`); process.exit(1); }
  const md = renderAnswerMap(map);
  if (process.argv.includes("--check")) {
    if (readFileSync(MD_PATH, "utf8") !== md) { console.error("TAB21_ANSWER_MAP.md is out of date. Run npm run register:answer-map."); process.exit(1); }
    console.log(`answer map ok — ${map.questions.length} questions, document current`);
  } else {
    writeFileSync(MD_PATH, md);
    console.log(`wrote ${MD_PATH} — ${map.questions.length} questions`);
  }
}

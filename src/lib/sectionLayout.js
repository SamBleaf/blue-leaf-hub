/**
 * sectionLayout.js — where everything on the Throughout and Site & existing steps goes (REGISTER_SCREENS_SPEC.md S3:
 * "The same compact row is used on the Throughout and Site & existing steps"). Pure: no React, no network. SectionStep
 * only draws what this returns, as the room screen draws roomLayout() (src/lib/roomScreen.js).
 *
 *   sectionLayout(register, context, section, { stage }) → {
 *     section: "project" | "site",
 *     topics: [{ key, label, primary, more, office }]   question lists, in the library's topic order; empty topics left out
 *     rowItems(q)          the records q's row(s) show (repeat: one row each; single: the first); linked rows excluded
 *     linked(q)            for a question with linked rows (gutters under a roof): { under(parentId), orphans }
 *     existing             the existing-works row (W-004 with W-006, W-008 and the rooms' R-013 records), or null
 *     other                every record of this step that no row shows ("Other things recorded here")
 *     shownIds             every record id the step shows, rows and "Other things recorded here" alike
 *   }
 *
 * The rules:
 *   - Every question is offered at every stage: promptsFor(..., { showDetail: true }). "Show detailed prompts" is retired:
 *     essential questions are the primary rows; detail, tender-stage and more-detail questions sit under "More choices";
 *     office-only questions under "Office only".
 *   - A question this job wouldn't be offered (a renovation question on a new build) still gets its row when it already
 *     holds a record, under "More choices". So does W-007 (now The project's "During the works") on Site.
 *   - A record no row shows (a legacy key, a custom item, a second record on a single question) is listed under
 *     "Other things recorded here". Nothing is ever hidden.
 *   - The client's story and brief (topic "brief"), the facts read from Sales (topic "context": project type and
 *     delivery) and the management questions belong to The project step. "Areas in the project" (P-006) is Site's.
 */
import {
  promptsFor, standardPrompts, questionById, resolvePromptId, answerConfigFor, isLinkedRow, PROJECT_TOPICS, SITE_TOPICS,
  HIDDEN_SITE_PROMPTS,
} from "./register.js";

/** The site question whose records the existing-works row shows (Tab 27 B06: one record, many ways in). */
export const EXISTING_WORKS_PROMPT = "W-004";
/** Reached from the existing-works row, not rows of their own. */
const EXISTING_FAMILY = new Set(["W-004", "W-006", "W-008", "R-013"]);
const CONNECTION_PROMPT = "W-008";

/** essential | more_detail | office_only: a house standard's own tier first. */
export const tierOf = (q) => { const c = answerConfigFor(q?.id); return c?.standard?.tier || c?.tier || "essential"; };
/** "Areas in the project" (P-006) sits with the existing building (spec S1); a house standard uses its own topic. */
export const topicOf = (q) => (q?.id === "P-006" ? "existing" : answerConfigFor(q?.id)?.standard?.topic || q?.topic);

const THROUGHOUT_TOPICS = new Set(PROJECT_TOPICS.map((t) => t.key).filter((k) => k !== "brief"));
/** Read-only facts and rows folded into another: never a row of their own. */
const NOT_A_ROW = new Set(["prefill", "folded"]);

/** Which step a question's records belong to: "project" (Throughout), "site", or "" (The project step, a room, the office). */
export function stepOfQuestion(q) {
  if (!q) return "";
  if (q.id === "P-006") return "site";
  if (q.section === "site") return "site";
  if (q.section === "project") return THROUGHOUT_TOPICS.has(q.topic) ? "project" : "";
  if (q.section === "room" && answerConfigFor(q.id)?.standard) return "project";   // a house standard (kitchen, wet areas, laundry)
  return "";
}

export function sectionLayout(register, context = {}, section = "project", { stage = "" } = {}) {
  const sec = section === "site" ? "site" : "project";
  const items = register?.items || [];
  const qidOf = (i) => resolvePromptId(i.promptKey);
  const houseLevel = items.filter((i) => !i.roomId);
  const rowRecords = (qid) => houseLevel.filter((i) => qidOf(i) === qid && !i.overridesDefaultId);

  // What this job is offered, at every stage (detail and tender questions included).
  const offered = [
    ...promptsFor(sec, {
      projectType: context?.projectType || "", deliveryModel: context?.deliveryModel, renovationOverlay: !!register?.meta?.renovationOverlay, stage, showDetail: true,
    }).filter((q) => stepOfQuestion(q) === sec),
    ...(sec === "site" ? [questionById("P-006")].filter(Boolean) : standardPrompts()),
  ].filter((q) => !NOT_A_ROW.has(answerConfigFor(q.id)?.handling));
  const offeredIds = new Set(offered.map((q) => q.id));
  // A question of this step that isn't offered on this job but already holds a record still has its row.
  const recordOnly = [];
  for (const i of houseLevel) {
    const q = questionById(qidOf(i));
    if (q && !offeredIds.has(q.id) && stepOfQuestion(q) === sec && !NOT_A_ROW.has(answerConfigFor(q.id)?.handling) && !recordOnly.some((x) => x.id === q.id)) recordOnly.push(q);
  }
  const hidden = (q) => sec === "site" && HIDDEN_SITE_PROMPTS.has(q.id) && !rowRecords(q.id).length;
  const questions = [...offered, ...recordOnly].filter((q) => !hidden(q));

  // The existing-works row: offered, or holding any of its family's records.
  const familyHere = (qid) => questions.some((q) => q.id === qid);
  const roomsExisting = items.filter((i) => i.roomId && qidOf(i) === "R-013" && !i.overridesDefaultId);
  const existing = sec === "site" && (familyHere(EXISTING_WORKS_PROMPT) || rowRecords("W-006").length || rowRecords(CONNECTION_PROMPT).length || roomsExisting.length)
    ? {
      question: questionById(EXISTING_WORKS_PROMPT),
      records: rowRecords(EXISTING_WORKS_PROMPT),
      protect: rowRecords("W-006"),
      rooms: roomsExisting,
      connection: rowRecords(CONNECTION_PROMPT)[0] || null,
      connectionQuestion: familyHere(CONNECTION_PROMPT) || rowRecords(CONNECTION_PROMPT).length ? questionById(CONNECTION_PROMPT) : null,
    }
    : null;

  // Topics: primary rows, then "More choices", then "Office only".
  const topicList = (sec === "site" ? SITE_TOPICS : PROJECT_TOPICS.filter((t) => t.key !== "brief")).map((t) => ({ ...t, primary: [], more: [], office: [] }));
  const topicFor = (q) => topicList.find((t) => t.key === topicOf(q)) || topicList[topicList.length - 1];
  const placed = new Set();
  for (const q of questions) {
    if (placed.has(q.id)) continue;
    if (EXISTING_FAMILY.has(q.id) && q.id !== EXISTING_WORKS_PROMPT) continue;   // shown inside the existing-works row
    if (q.id === EXISTING_WORKS_PROMPT && !existing) continue;
    placed.add(q.id);
    const t = topicFor(q);
    const tier = tierOf(q);
    if (tier === "office_only") t.office.push(q);
    else if (!offeredIds.has(q.id) || tier !== "essential" || q.detail || q.stage === "T") t.more.push(q);
    else t.primary.push(q);
  }
  // The existing-works row always shows when it has records, even if W-004 itself isn't offered here.
  if (existing && !placed.has(EXISTING_WORKS_PROMPT) && existing.question) {
    placed.add(EXISTING_WORKS_PROMPT);
    (topicList.find((t) => t.key === "existing") || topicList[0]).more.push(existing.question);
  }

  const rowItems = (q) => {
    const cfg = answerConfigFor(q.id);
    const own = rowRecords(q.id).filter((i) => !isLinkedRow(cfg, i));
    return cfg?.repeat || cfg?.standard ? own : own.slice(0, 1);
  };
  const linked = (q) => {
    const cfg = answerConfigFor(q.id);
    if (!cfg?.linked) return null;
    const rows = rowItems(q);
    const all = rowRecords(q.id).filter((i) => isLinkedRow(cfg, i));
    return {
      under: (parentId) => all.filter((i) => (i.answer?.linkedItemIds || []).includes(parentId)),
      orphans: all.filter((i) => !rows.some((r) => (i.answer?.linkedItemIds || []).includes(r.id))),
    };
  };

  const shownIds = new Set();
  const topics = topicList.filter((t) => t.primary.length || t.more.length || t.office.length);
  for (const t of topics) {
    for (const q of [...t.primary, ...t.more, ...t.office]) {
      if (q.id === EXISTING_WORKS_PROMPT) continue;
      for (const i of rowItems(q)) shownIds.add(i.id);
      // Linked rows (gutters) show under their parent, or on their own when the parent has gone.
      const cfg = answerConfigFor(q.id);
      if (cfg?.linked) for (const i of rowRecords(q.id)) if (isLinkedRow(cfg, i)) shownIds.add(i.id);
    }
  }
  if (existing) {
    for (const i of [...existing.records, ...existing.protect, ...existing.rooms]) shownIds.add(i.id);
    if (existing.connection) shownIds.add(existing.connection.id);
  }

  // Everything of this step no row shows: by its question's step, or (no question) by the step it was recorded on.
  const belongs = (i) => {
    const q = questionById(qidOf(i));
    return q ? stepOfQuestion(q) === sec : i.section === sec;
  };
  const other = houseLevel.filter((i) => belongs(i) && !shownIds.has(i.id));
  for (const i of other) shownIds.add(i.id);

  return { section: sec, topics, rowItems, linked, existing, other, shownIds };
}

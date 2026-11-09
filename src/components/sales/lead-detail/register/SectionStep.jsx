/**
 * SectionStep — a project-wide section of the library: "Whole house" (Tab 21 §3, defaults rooms inherit)
 * or "Site & existing conditions" (Tab 21 §2). Only the prompts relevant to the project type / stage are
 * shown, grouped by topic; nothing is compulsory.
 */
import { useState } from "react";
import { promptsFor, standardPrompts, resolvePromptId, answerConfigFor, isLinkedRow, assumptionFor, partAssumptionFor, PROJECT_TOPICS, SITE_TOPICS } from "../../../../lib/register.js";
import { Section } from "./ui.jsx";
import PromptRow, { RepeatRows } from "./PromptRow.jsx";
import BaselineGuide, { PerformanceReview } from "./BaselineGuide.jsx";

const tierOf = (q) => { const c = answerConfigFor(q.id); return c?.standard?.tier || c?.tier || "essential"; };
const topicOf = (q) => answerConfigFor(q.id)?.standard?.topic || q.topic;

export default function SectionStep({ section, reg, context, stage, showDetail, actor, upsertItem, updateItem, deleteItem, readOnly, saveState, mutateMeta }) {
  const [showConnection, setShowConnection] = useState(false);
  const projectType = context?.projectType || "";
  const qs = [...promptsFor(section === "site" ? "site" : "project", {
    projectType, deliveryModel: context?.deliveryModel, renovationOverlay: reg.meta.renovationOverlay, stage, showDetail,
  }).filter((q) => q.topic !== "brief"), ...(section === "site" ? [] : standardPrompts())];
  const topics = section === "site" ? SITE_TOPICS : PROJECT_TOPICS.filter((t) => t.key !== "brief");
  const secKey = section === "site" ? "site" : "project";
  const allFor = (qid) => reg.items.filter((i) => !i.roomId && resolvePromptId(i.promptKey) === qid && !i.overridesDefaultId);
  const itemsFor = (qid) => allFor(qid).filter((i) => !isLinkedRow(answerConfigFor(qid), i));
  const itemFor = (qid) => itemsFor(qid)[0] || null;
  const rowProps = { actor, saveState, meeting: true, assumptionOf: (it) => assumptionFor(reg, it) || partAssumptionFor(reg, it) };
  const store = { upsertItem, updateItem, deleteItem };
  const areaOptions = (reg.meta.rooms || []).map((r) => ({ id: r.id, label: r.name }));
  const qById = (id) => qs.find((q) => q.id === id);
  // W-006 and W-008 are reached from the W-004 path (Tab 27 B06). Every record keeps its own promptKey, so nothing merges in the data.
  const presentedElsewhere = (q) => !!answerConfigFor(q.id)?.presentedWith;
  const existingWorks = (q, cfg, seed) => {
    const records = reg.items.filter((i) => !i.overridesDefaultId && ["W-004", "W-006", "R-013"].includes(resolvePromptId(i.promptKey)) && (!i.roomId || resolvePromptId(i.promptKey) === "R-013"));
    const roomOf = (i) => (i.roomId ? (reg.meta.rooms || []).find((r) => r.id === i.roomId)?.name : "");
    const connections = qById("W-008");
    const connection = connections && itemFor("W-008");
    return (
      <div key={q.id} className="space-y-2">
        <RepeatRows question={q} items={records} seed={seed} readOnly={readOnly} areaOptions={areaOptions} titleOf={roomOf} {...rowProps} {...store} />
        {connections && (connection || showConnection) && (
          <PromptRow question={connections} item={connection} seed={{ itemKind: connections.itemKind, category: connections.category, promptKey: "W-008", section: secKey, technicalStatus: connections.technical, responsibility: connections.owner || "", disposition: "undecided" }}
            readOnlyReason={readOnly ? "Read-only" : null} {...rowProps}
            onChange={(partial) => (connection ? updateItem(connection.id, partial) : upsertItem({ itemKind: connections.itemKind, category: connections.category, promptKey: "W-008", section: secKey, technicalStatus: connections.technical, responsibility: connections.owner || "", disposition: "undecided" }, partial))}
            onDelete={connection ? () => deleteItem(connection.id) : null} />
        )}
        {connections && !connection && !showConnection && !readOnly && (
          <button type="button" onClick={() => setShowConnection(true)} data-testid="add-connection" className="focus-ring inline-flex min-h-[40px] items-center rounded-full border border-dashed border-hairline px-3 text-[11px] font-semibold text-primary hover:bg-page sm:min-h-[30px]">+ New-to-existing connection</button>
        )}
      </div>
    );
  };
  const renderPrompt = (q) => {
    const cfg = answerConfigFor(q.id);
    const seed = { itemKind: q.itemKind, category: q.category, promptKey: q.id, section: secKey, isDefault: !!q.isDefault || !!cfg?.standard,
      technicalStatus: q.technical, responsibility: q.owner || "", disposition: "undecided" };
    if (q.id === "W-004") return existingWorks(q, cfg, seed);
    if (cfg?.linked) return renderWithLinked(q, cfg, seed);
    if (cfg?.repeat || cfg?.standard) {
      return <RepeatRows key={q.id} question={q} items={itemsFor(q.id)} seed={seed} readOnly={readOnly} {...rowProps} {...store} />;
    }
    const item = itemFor(q.id);
    return (
      <div key={q.id} className="space-y-1.5">
        <PromptRow question={q} item={item} seed={seed} readOnlyReason={readOnly ? "Read-only" : null} {...rowProps}
          onChange={(partial) => (item ? updateItem(item.id, partial) : upsertItem(seed, partial))}
          onDelete={item ? () => deleteItem(item.id) : null} />
        {cfg?.reviewSuggestions && <PerformanceReview item={item} />}
      </div>
    );
  };
  // A linked item (gutters) is its own record under the row it belongs to, so a roof's colour never has to say what its gutters are.
  function renderWithLinked(q, cfg, seed) {
    const linked = allFor(q.id).filter((i) => isLinkedRow(cfg, i));
    const rows = itemsFor(q.id);
    const under = (parent) => linked.filter((i) => (i.answer?.linkedItemIds || []).includes(parent.id));
    const linkedSeed = (parent) => ({ ...seed, isDefault: false, responsibility: "", answer: { element: { id: `el_${cfg.linked.key}_${parent.id}`, key: cfg.linked.key, label: cfg.linked.label }, linkedItemIds: [parent.id] } });
    const orphans = linked.filter((i) => !rows.some((r) => (i.answer?.linkedItemIds || []).includes(r.id)));
    return (
      <div key={q.id} className="space-y-2">
        <RepeatRows question={q} items={rows} seed={seed} readOnly={readOnly} {...rowProps} {...store}
          renderBelow={(parent) => (
            <div className="ml-3 border-l-2 border-hairline pl-2">
              <RepeatRows question={q} items={under(parent)} seed={linkedSeed(parent)} readOnly={readOnly} noAdd actor={actor} saveState={saveState} {...store} />
            </div>
          )} />
        {orphans.length > 0 && <RepeatRows question={q} items={orphans} seed={{ ...seed, isDefault: false, answer: { element: { key: cfg.linked.key, label: cfg.linked.label } } }} readOnly={readOnly} noAdd actor={actor} saveState={saveState} {...store} />}
      </div>
    );
  }
  const s = context?.site;

  return (
    <div className="space-y-3">
      {section === "site" && (
        <div className="rounded-lg border border-hairline bg-page p-3 text-xs">
          <p className="section-label mb-1">Site intelligence on file (read-only)</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-ink">
            <span>Council: <b>{s?.council || "—"}</b></span>
            <span>Zone: <b>{s?.zone || "—"}</b></span>
            <span>Bushfire prone: <b>{s?.bushfire == null ? "—" : s.bushfire ? "Yes" : "No"}</b></span>
            <span>Slope: <b>{s?.slopeBand || "—"}</b></span>
            <span>Complexity: <b>{s?.complexity || "—"}</b></span>
            {s?.whsProfileId && <span className="text-muted">WHS site profile exists (compliance record — not scope)</span>}
          </div>
          <p className="mt-1 text-[10px] text-muted">Record what affects scope, cost or design below. Anything a consultant must confirm is marked “needs verification” and flows to the Architect Brief and tender risks — never to the client portal.</p>
        </div>
      )}
      {section !== "site" && (
        <p className="text-xs text-muted">Set the project-wide standards once, starting with what the client wants the home to be. Rooms inherit floors, paint, kitchen, wet-area and laundry standards; record a <span className="font-medium text-ink">room exception</span> only where a room differs.</p>
      )}
      {topics.map((t) => {
        const list = qs.filter((q) => topicOf(q) === t.key && !presentedElsewhere(q));
        if (!list.length) return null;
        const started = list.filter((q) => itemFor(q.id)).length;
        const lead = list.filter((q) => tierOf(q) === "essential");
        const explore = list.filter((q) => tierOf(q) === "more_detail");
        const office = list.filter((q) => tierOf(q) === "office_only");
        return (
          <Section key={t.key} title={t.label} count={started ? `${started}/${list.length}` : null} defaultOpen>
            {lead.map(renderPrompt)}
            {explore.length > 0 && (lead.length > 0
              ? <Section title="Explore more" count={explore.length} defaultOpen={false}>{explore.map(renderPrompt)}</Section>
              : explore.map(renderPrompt))}
            {office.length > 0 && <Section title="Office only" count={office.length} defaultOpen={false}>{office.map(renderPrompt)}</Section>}
          </Section>
        );
      })}
      {!qs.length && <p className="text-xs text-muted">No prompts apply at this stage. Turn on “Show detailed prompts” to work ahead.</p>}
      {section !== "site" && <BaselineGuide reg={reg} actor={actor} mutateMeta={mutateMeta} readOnly={readOnly} />}
    </div>
  );
}

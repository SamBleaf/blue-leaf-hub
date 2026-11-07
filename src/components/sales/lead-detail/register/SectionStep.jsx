/**
 * SectionStep — a project-wide section of the library: "Whole house" (Tab 21 §3, defaults rooms inherit)
 * or "Site & existing conditions" (Tab 21 §2). Only the prompts relevant to the project type / stage are
 * shown, grouped by topic; nothing is compulsory.
 */
import { promptsFor, resolvePromptId, PROJECT_TOPICS, SITE_TOPICS } from "../../../../lib/register.js";
import { Section } from "./ui.jsx";
import PromptRow from "./PromptRow.jsx";

export default function SectionStep({ section, reg, context, stage, showDetail, actor, upsertItem, updateItem, deleteItem, readOnly }) {
  const projectType = context?.projectType || "";
  const qs = promptsFor(section === "site" ? "site" : "project", {
    projectType, deliveryModel: context?.deliveryModel, renovationOverlay: reg.meta.renovationOverlay, stage, showDetail,
  }).filter((q) => q.topic !== "brief");
  const topics = section === "site" ? SITE_TOPICS : PROJECT_TOPICS.filter((t) => t.key !== "brief");
  const secKey = section === "site" ? "site" : "project";
  const itemFor = (qid) => reg.items.find((i) => !i.roomId && resolvePromptId(i.promptKey) === qid && !i.overridesDefaultId) || null;
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
        <p className="text-xs text-muted">Set the project-wide standards once. Rooms inherit floor and wall/ceiling defaults automatically; record a <span className="font-medium text-ink">room exception</span> only where a room differs.</p>
      )}
      {topics.map((t) => {
        const list = qs.filter((q) => q.topic === t.key);
        if (!list.length) return null;
        const started = list.filter((q) => itemFor(q.id)).length;
        return (
          <Section key={t.key} title={t.label} count={started ? `${started}/${list.length}` : null} defaultOpen>
            {list.map((q) => {
              const item = itemFor(q.id);
              const seed = { itemKind: q.itemKind, category: q.category, promptKey: q.id, section: secKey, isDefault: !!q.isDefault,
                technicalStatus: q.technical, responsibility: q.owner || "", disposition: q.itemKind === "scope" ? "undecided" : "undecided" };
              return (
                <PromptRow key={q.id} question={q} item={item} seed={seed} actor={actor} readOnlyReason={readOnly ? "Read-only" : null}
                  onChange={(partial) => (item ? updateItem(item.id, partial) : upsertItem(seed, partial))}
                  onDelete={item ? () => deleteItem(item.id) : null} />
              );
            })}
          </Section>
        );
      })}
      {!qs.length && <p className="text-xs text-muted">No prompts apply at this stage. Turn on “Show detailed prompts” to work ahead.</p>}
    </div>
  );
}

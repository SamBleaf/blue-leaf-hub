/**
 * SectionStep — the Throughout step (the house-wide choices rooms read) and the Site & existing step
 * (REGISTER_SCREENS_SPEC.md S3: "The same compact row is used on the Throughout and Site & existing steps").
 *
 * One card per topic, each built from the room screen's parts: flat ChoiceRow rows (label, chips, ⚑, ⋯ → Product
 * details), "More choices (n)" for the detailed ones, and a collapsed "Office only (n)". No question codes, kind or
 * category chips, help lines, "Recorded:" echoes or office-field toggles. A house standard is laid out one row per zone
 * (ChoiceRepeat); gutters sit under their roof. Which question goes where, and what no row shows, is sectionLayout() in
 * src/lib/sectionLayout.js; this file only draws it. Anything recorded that no row shows is under "Other things recorded
 * here", so nothing is hidden.
 */
import { useRef, useState } from "react";
import { genId, answerConfigFor, questionById, resolvePromptId, assumptionFor, partAssumptionFor } from "../../../../lib/register.js";
import { labelOf } from "../../../../lib/briefModel.js";
import { sectionLayout } from "../../../../lib/sectionLayout.js";
import { contractFixed } from "../../../../lib/roomScreen.js";
import ChoiceRow, { ChoiceRepeat } from "./ChoiceRow.jsx";
import BaselineGuide, { PerformanceReview } from "./BaselineGuide.jsx";
import { NeedsActionFlag } from "./NeedsAction.jsx";
import { ChoiceChip, ChipLine, DraftInput } from "./RoomUi.jsx";

const h2 = "text-[17px] font-bold leading-6 text-ink";
const disclosure = "focus-ring flex min-h-[48px] w-full items-center justify-between gap-2 px-4 text-left text-[15px] font-bold sm:text-sm";
const addBtn = "focus-ring inline-flex min-h-[44px] items-center rounded-full border border-dashed border-primary px-4 text-sm font-bold text-primary hover:bg-primary/5";
const Chevron = ({ open, down = false }) => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    className={`shrink-0 transition ${open ? (down ? "rotate-180" : "rotate-90") : ""}`}>
    {down ? <path d="M6 9l6 6 6-6" /> : <path d="M9 6l6 6-6 6" />}
  </svg>
);

const INTRO = {
  project: "Set the house-wide choices once, starting with what the client wants the home to be. Every room reads these; a room only says so where it's different.",
  site: "What the site and the existing house mean for the work. Council, zone and bushfire are on The project.",
};

/** The seed a question's new record is made from. */
function seedOf(q, secKey) {
  const cfg = answerConfigFor(q.id);
  // A record keeps its question's own section ("Areas in the project" stays a project record); a house standard is Throughout's.
  return { itemKind: q.itemKind, category: q.category, promptKey: q.id, section: q.section === "project" || q.section === "site" ? q.section : secKey, isDefault: !!q.isDefault || !!cfg?.standard,
    technicalStatus: q.technical, responsibility: q.owner || "", disposition: "undecided" };
}

// "Areas in the project": what each area's place in this job is. The disposition IS the answer here.
const AREA_STATES = [["included", "Included"], ["undecided", "Optional"], ["excluded", "Excluded"], ["deferred", "Deferred"]];

/**
 * "Areas in the project" (P-006, moved here from The project, spec S1): one record per area of the property, each named
 * in words with Included · Optional · Excluded · Deferred, its ⚑, and Remove. "+ Area" starts the next one.
 */
function AreasRow({ q, items, secKey, reg, context, upsertItem, updateItem, deleteItem, readOnly }) {
  const [adding, setAdding] = useState(null);
  const seed = (id) => ({ ...seedOf(q, secKey), id, disposition: "included" });
  const open = adding && !items.some((i) => i.id === adding) ? adding : null;
  const rows = [...items, ...(open ? [null] : [])];
  return (
    <div className="border-t border-hairline px-4 py-3 first:border-t-0" data-testid="choice-row-P-006">
      <p className="text-[15px] font-bold leading-5 text-ink sm:text-sm" title={q.text || undefined}>{q.short}</p>
      {!rows.length && <p className="mt-0.5 text-[13px] text-muted">Name each part of the property, and whether it&apos;s in this job.</p>}
      {rows.map((it) => {
        const id = it ? it.id : open;
        const fixed = !!readOnly || contractFixed(it);
        const patch = (partial) => (it ? updateItem(it.id, partial) : upsertItem(seed(id), partial));
        return (
          <div key={id} className="mt-3 space-y-2" data-testid={`area-${id}`}>
            <div className="flex items-start gap-1">
              <DraftInput value={it?.description || ""} onCommit={(v) => patch({ description: v })} disabled={fixed} aria-label="Area"
                placeholder="Area, e.g. rear extension or front garden" className="inp min-h-[44px] w-full px-3 text-base sm:text-sm" />
              {it && <NeedsActionFlag reg={reg} context={context} item={it} updateItem={updateItem} upsertItem={upsertItem} readOnly={readOnly} />}
            </div>
            <ChipLine heading="In this job?">
              {AREA_STATES.map(([d, l]) => <ChoiceChip key={d} on={(it?.disposition || "included") === d && !!it} disabled={fixed} onClick={() => patch({ disposition: d })}>{l}</ChoiceChip>)}
              {it && !fixed && <button type="button" onClick={() => deleteItem(it.id)} className="focus-ring inline-flex min-h-[44px] items-center rounded px-2 text-sm font-bold text-red-700 hover:underline">Remove</button>}
            </ChipLine>
          </div>
        );
      })}
      {!readOnly && !open && (
        <div className="pt-3">
          <button type="button" onClick={() => setAdding(genId())} className={addBtn} data-testid="add-area">+ Area</button>
        </div>
      )}
    </div>
  );
}

/** A topic's card: the primary rows, then "More choices (n)", then a collapsed "Office only (n)". */
function TopicCard({ topic, renderQ }) {
  const { primary, more, office: officeQs } = topic;
  // A topic with nothing to ask first opens on its detailed choices.
  const [moreOpen, setMoreOpen] = useState(!primary.length);
  const [officeOpen, setOfficeOpen] = useState(false);
  const officeGroup = officeQs.length > 0 && (
    <div className="border-t border-hairline">
      <button type="button" aria-expanded={officeOpen} onClick={() => setOfficeOpen((v) => !v)} className={`${disclosure} text-muted`} data-testid={`office-only-${topic.key}`}>
        <span>Office only ({officeQs.length})</span><Chevron open={officeOpen} />
      </button>
      {officeOpen && <div className="bg-page/40">{officeQs.map(renderQ)}</div>}
    </div>
  );
  return (
    <section aria-labelledby={`topic-${topic.key}`} className="rounded-card border border-hairline bg-surface" data-testid={`topic-${topic.key}`}>
      <h2 id={`topic-${topic.key}`} className={`${h2} px-4 pb-1 pt-4`}>{topic.label}</h2>
      {primary.map(renderQ)}
      {more.length > 0 && (
        <div className="border-t border-hairline">
          <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)} className={`${disclosure} text-primary`} data-testid={`more-choices-${topic.key}`}>
            <span>More choices ({more.length})</span><Chevron open={moreOpen} down />
          </button>
          {moreOpen && <div>{more.map(renderQ)}</div>}
        </div>
      )}
      {officeGroup}
      {!primary.length && !more.length && !officeQs.length && <p className="px-4 pb-3 text-[13px] text-muted">Nothing to record here yet.</p>}
    </section>
  );
}

export default function SectionStep({ section, reg, context, stage, actor, upsertItem, updateItem, deleteItem, readOnly, saveState, mutateMeta, onPortalItem }) {
  const layout = sectionLayout(reg, context, section, { stage });
  const secKey = layout.section;
  const [showConnection, setShowConnection] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);

  // One stable id per unanswered question, so a quick second tap updates the record the first one made (RoomScreen's rule).
  const seedIds = useRef(new Map());
  const usedIds = useRef(new Set());
  const present = new Set(reg.items.map((i) => i.id));
  for (const id of seedIds.current.values()) if (present.has(id)) usedIds.current.add(id);
  const seedFor = (q, key = q.id) => {
    let id = seedIds.current.get(key);
    if (!id || (usedIds.current.has(id) && !present.has(id))) { id = genId(); seedIds.current.set(key, id); }
    return { ...seedOf(q, secKey), id };
  };

  const rooms = reg.meta.rooms || [];
  const roomName = (id) => rooms.find((r) => r.id === id)?.name || "";
  const areaOptions = rooms.map((r) => ({ id: r.id, label: r.name }));
  const row = {
    reg, context, actor, saveState, upsertItem, updateItem, deleteItem, readOnly, onPortalItem, room: null,
    assumptionOf: (it) => assumptionFor(reg, it) || partAssumptionFor(reg, it),
  };

  function existingWorks(q) {
    const ex = layout.existing;
    const w6 = questionById("W-006"), r13 = questionById("R-013"), w8 = ex.connectionQuestion;
    return (
      <div key={q.id} className="border-t border-hairline first:border-t-0" data-testid="existing-works">
        <ChoiceRepeat question={q} items={ex.records} seed={seedOf(q, secKey)} areaOptions={areaOptions} {...row} />
        {w6 && ex.protect.map((it) => <ChoiceRow key={it.id} question={w6} item={it} seed={{ ...seedOf(w6, secKey), id: it.id }} areaOptions={areaOptions} {...row} />)}
        {r13 && ex.rooms.map((it) => (
          <ChoiceRow key={it.id} question={r13} item={it} seed={{ id: it.id, roomId: it.roomId, promptKey: "R-013" }}
            rowTitle={`${r13.short}${roomName(it.roomId) ? `: ${roomName(it.roomId)}` : ""}`} {...row} />
        ))}
        {w8 && (ex.connection || showConnection) && (
          <ChoiceRow question={w8} item={ex.connection} seed={ex.connection ? { ...seedOf(w8, secKey), id: ex.connection.id } : seedFor(w8)} {...row} />
        )}
        {w8 && !ex.connection && !showConnection && !readOnly && (
          <div className="px-4 pb-3 pt-1">
            <button type="button" onClick={() => setShowConnection(true)} data-testid="add-connection" className={addBtn}>+ New-to-existing connection</button>
          </div>
        )}
      </div>
    );
  }

  // Gutters are their own records under the roof they belong to, so a roof's colour never has to say what its gutters are.
  function withLinked(q, cfg) {
    const l = layout.linked(q);
    const base = seedOf(q, secKey);
    const linkedSeed = (parent) => ({ ...base, isDefault: false, responsibility: "", answer: { element: { id: `el_${cfg.linked.key}_${parent.id}`, key: cfg.linked.key, label: cfg.linked.label }, linkedItemIds: [parent.id] } });
    return (
      <div key={q.id} className="border-t border-hairline first:border-t-0">
        <ChoiceRepeat question={q} items={layout.rowItems(q)} seed={base} {...row}
          renderBelow={(parent) => (
            <div className="ml-4 border-l-2 border-hairline">
              <ChoiceRepeat question={q} items={l.under(parent.id)} seed={linkedSeed(parent)} noAdd {...row} />
            </div>
          )} />
        {l.orphans.length > 0 && (
          <ChoiceRepeat question={q} items={l.orphans} seed={{ ...base, isDefault: false, answer: { element: { key: cfg.linked.key, label: cfg.linked.label } } }} noAdd {...row} />
        )}
      </div>
    );
  }

  function renderQ(q) {
    const cfg = answerConfigFor(q.id);
    if (q.id === "W-004" && layout.existing) return existingWorks(q);
    if (q.id === "P-006") return <AreasRow key={q.id} q={q} items={layout.rowItems(q)} secKey={secKey} {...row} />;
    if (cfg?.linked) return withLinked(q, cfg);
    if (cfg?.repeat || cfg?.standard) {
      return (
        <div key={q.id} className="border-t border-hairline first:border-t-0">
          <ChoiceRepeat question={q} items={layout.rowItems(q)} seed={seedOf(q, secKey)} {...row} />
        </div>
      );
    }
    const item = layout.rowItems(q)[0] || null;
    return (
      <div key={q.id} className="border-t border-hairline first:border-t-0">
        <ChoiceRow question={q} item={item} seed={item ? { ...seedOf(q, secKey), id: item.id } : seedFor(q)} {...row} />
        {cfg?.reviewSuggestions && item && <div className="px-4 pb-3"><PerformanceReview item={item} /></div>}
      </div>
    );
  }

  const other = layout.other;
  return (
    <div className="space-y-3" data-testid={`section-step-${secKey}`}>
      <p className="text-[15px] leading-snug text-muted sm:text-sm">{INTRO[secKey]}</p>
      {layout.topics.map((t) => <TopicCard key={t.key} topic={t} renderQ={renderQ} />)}
      {!layout.topics.length && <p className="text-[15px] text-muted sm:text-sm">Nothing to record here yet.</p>}
      {other.length > 0 && (
        <section className="rounded-card border border-hairline bg-surface" data-testid="section-other">
          <button type="button" aria-expanded={otherOpen} onClick={() => setOtherOpen((v) => !v)} className={`${disclosure} text-muted`}>
            <span>Other things recorded here ({other.length})</span><Chevron open={otherOpen} />
          </button>
          {otherOpen && (
            <div className="border-t border-hairline">
              {other.map((it) => {
                const q = questionById(resolvePromptId(it.promptKey)) || null;
                return <ChoiceRow key={it.id} question={q} item={it} seed={{ id: it.id }} rowTitle={q ? undefined : labelOf(it)} {...row} />;
              })}
            </div>
          )}
        </section>
      )}
      {secKey === "project" && <BaselineGuide reg={reg} actor={actor} mutateMeta={mutateMeta} readOnly={readOnly} />}
    </div>
  );
}

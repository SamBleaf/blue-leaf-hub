/**
 * RoomBriefCard — the room brief, first on a room screen (REGISTER_SCREENS_SPEC.md S3 card 4, S3p; owner decisions 3, 17 Nov 2026).
 *
 * The room brief is the room's R-004 record (build contract): the sentence is its description, "Connects to" its
 * answer.connectsTo, "Who uses it" its answer.usedBy, and the rough size its quantity in m². The record is made on the first
 * keystroke or tap. Must-haves are the room type's own layout records (ROOM_MUST_HAVES), through the existing answer
 * machinery; a room type without one uses R-004's own chips. "How this room reads" is the shared brief model the PDF uses.
 *
 * compact: the version in the Documents edit drawer (name, floor, Work, the earlier-answer banner, the brief, Connects to,
 * must-haves, and "Open the full room ›").
 *
 * Also exported: WorkControl (the room's one Work word), EarlierAnswerBanner (an earlier whole-room answer that disagrees)
 * and FloorChips (the floor, chosen from chips).
 *
 * After the contract (a baselined or locked brief) the sentence, chips and size are read-only: the server refuses those
 * changes, so they are never offered, and the caption says to use a variation.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  genId, makeItem, answerConfigFor, questionById, resolvePromptId, ROOM_SCOPES, ROOM_WORK_WORDS, ROOM_SCOPES_WITH_WORK, ROOM_MUST_HAVES, ROOM_USED_BY, ROOM_BRIEF_PROMPT,
} from "../../../../lib/register.js";
import { clean, isUnfinished, hasRoomBrief, roomBriefRecord, disagreeingScope, roomRow, architectBriefModel, labelOf } from "../../../../lib/briefModel.js";
import {
  briefSeed, roomSeed, standardBriefText, toggleAnswerList, connectedFrom, connectCandidates, earlierWords, workWordFor, keepWorkPlan, changeWorkPlan,
  readdable, contractFixed, setRoomScope, renameRoomMeta, moveRoomToFloor, floorChoices, floorKey, normaliseFloor, workLabel, savedFloors, floorsPatch,
} from "../../../../lib/roomScreen.js";
import { useEscapeLayer } from "../../../../lib/overlayFlag.js";
import { ChoiceChips } from "./ChoiceRow.jsx";
import { AutoTextarea, ChipLine, ChoiceChip, NameInput, Segmented, Toast } from "./RoomUi.jsx";
import { useToast } from "./useRoomUi.js";

const label13 = "text-[13px] font-bold text-ink";
const textBtn = "focus-ring inline-flex min-h-[44px] items-center rounded px-1 text-sm font-bold text-primary hover:underline";
const inputCls = "inp min-h-[44px] w-full px-3 text-[16px] sm:text-sm";   // 16 px on a phone, so iOS doesn't zoom

/**
 * The room's one Work word: New · Renovated · Altered · No change ("Not in this job" sits behind ⋯). minSegment: the
 * narrowest a segment may be before the control wraps to 2 × 2 (96 px in the tablet room screen, spec S3).
 */
export function WorkControl({ room, onChange, readOnly, full = false, minSegment = 0 }) {
  return (
    <Segmented full={full} label="Work" value={room?.scope} disabled={readOnly} onChange={(k) => { if (k !== room.scope) onChange(k); }}
      options={ROOM_WORK_WORDS.map((k) => [k, ROOM_SCOPES[k]])} minSegment={minSegment} testId="work-control" />
  );
}

/**
 * The floor, from chips: the job's floors (with one added on the Rooms list and still empty), Ground and Upper, and
 * "+ Floor" for a named one. Saves on tap.
 */
export function FloorChips({ reg, room, mutateMeta, readOnly, onDone }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const rooms = reg.meta.rooms || [];
  const extra = savedFloors(reg.meta);
  // Escape while naming a floor closes only the name box (the top layer), never the menu or the workspace under it.
  const stopNaming = useCallback(() => { setNaming(false); setName(""); }, []);
  useEscapeLayer(naming && !readOnly, stopNaming);
  const set = (level) => {
    const next = moveRoomToFloor(rooms, room.id, level);
    mutateMeta({ rooms: next, ...floorsPatch(reg.meta.floors, next) });
    onDone?.();
  };
  const save = () => { const n = normaliseFloor(name); if (clean(name)) set(n); setNaming(false); setName(""); };
  return (
    <ChipLine heading="Floor">
      {floorChoices(rooms, extra).map((f) => (
        <ChoiceChip key={f.key} on={floorKey(room.level) === f.key} disabled={readOnly} onClick={() => set(f.level)}>{f.label}</ChoiceChip>
      ))}
      {!readOnly && (naming ? (
        <span className="flex w-full items-center gap-2 sm:w-auto">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            placeholder="e.g. Lower ground" aria-label="Floor name" className="inp min-h-[44px] flex-1 px-3 text-[16px] sm:w-44 sm:text-sm" />
          <button type="button" onClick={save} className="min-h-[44px] rounded-lg bg-primary px-3 text-sm font-bold text-white">Add</button>
        </span>
      ) : <ChoiceChip tone="add" onClick={() => setNaming(true)}>+ Floor</ChoiceChip>)}
    </ChipLine>
  );
}

/**
 * "An earlier answer says “New kitchen”, but this room is set to Renovated. Only one can print." [Keep Renovated] deletes
 * that record; [Change to New] sets the Work and deletes the records that now disagree. Both offer Undo (the records come
 * back under a fresh id). After the contract the baseline guard would refuse the delete, so the banner says to use a variation.
 */
export function EarlierAnswerBanner({ reg, room, mutateMeta, deleteItem, addItem, readOnly, onSettled }) {
  const { toast, show, clear } = useToast();
  const latest = useRef(reg);
  latest.current = reg;
  const list = room && room.scope !== "not_in_scope" ? disagreeingScope(reg, room) : [];
  const first = list[0];
  const toastEl = <Toast toast={toast} onClose={clear} />;
  if (!first) return toastEl;
  const words = earlierWords(first);
  const now = workLabel(room.scope);
  const target = workWordFor(first);
  const plan = target ? changeWorkPlan(reg, room, target) : null;
  const fixed = contractFixed(first) || (plan && plan.remove.some(contractFixed));
  const restore = (items, scope) => () => {
    if (scope) mutateMeta({ rooms: setRoomScope(latest.current.meta.rooms, room.id, scope) });
    if (addItem) items.forEach((i) => addItem(readdable(i)));
  };
  const keep = () => {
    const { remove } = keepWorkPlan(reg, room);
    remove.forEach((i) => deleteItem(i.id));
    show(`Removed “${words}”.`, addItem ? restore(remove, null) : null);
    onSettled?.();
  };
  const change = () => {
    const before = room.scope;
    mutateMeta({ rooms: setRoomScope(reg.meta.rooms, room.id, plan.scope) });
    plan.remove.forEach((i) => deleteItem(i.id));
    show(plan.remove.length ? `Removed ${plan.remove.map((i) => `“${earlierWords(i)}”`).join(", ")}.` : `Changed to ${workLabel(plan.scope)}.`, restore(plan.remove, before));
    onSettled?.();
  };
  const btn = "focus-ring min-h-[44px] rounded-lg border border-primary bg-surface px-4 text-[15px] font-bold text-primary hover:bg-primary/5 sm:text-sm";
  return (
    <>
      <div role="status" className="space-y-2.5 rounded-card border-l-[3px] border-warning bg-warning/10 py-3 pl-3.5 pr-3" data-testid="earlier-answer-banner">
        <p className="text-[15px] leading-5 text-ink sm:text-sm">An earlier answer says “{words}”, but this room is set to {now}. Only one can print.</p>
        {fixed ? (
          <p className="text-[15px] font-bold leading-5 text-ink sm:text-sm">This room is part of the signed contract — change it through a variation.</p>
        ) : !readOnly && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={keep} className={btn} data-testid="banner-keep">Keep {now}</button>
            {plan && <button type="button" onClick={change} className={btn} data-testid="banner-change">Change to {workLabel(plan.scope)}</button>}
          </div>
        )}
      </div>
      {toastEl}
    </>
  );
}

const HELD = { disagrees: "disagrees with the room", unfinished: "looks unfinished", contradicts: "its words contradict its status", no_ask: "doesn't say what's needed" };
function heldWords(reg, held) {
  return held.map(({ id, reason }) => {
    const i = reg.items.find((x) => x.id === id);
    if (!i) return "";
    if (reason === "disagrees") return `the earlier answer “${earlierWords(i)}” (${HELD[reason]})`;
    const typed = clean(i.description);
    return `${typed ? `“${typed}”` : labelOf(i)} (${HELD[reason] || "held back"})`;
  }).filter(Boolean);
}

/** "How this room reads in the architect's brief": the row the PDF prints, from the same model. */
function HowItReads({ reg, context, room }) {
  const view = useMemo(() => {
    const row = roomRow(reg, context, room);
    if (room.scope === "not_in_scope") return { text: "Listed under “Rooms not in this job”.", held: [] };
    let text = row.text, placeholder = row.placeholder;
    try {
      const model = architectBriefModel(reg, context || {}, {});
      const hit = model.roomGroups.flatMap((g) => g.rows).find((r) => (r.roomIds || []).includes(room.id));
      if (hit) { text = hit.text; placeholder = hit.placeholder; }
    } catch { /* the room's own row stands */ }
    return { text: text || (placeholder ? "Brief to follow" : ""), muted: !text, work: row.work, held: heldWords(reg, row.held) };
  }, [reg, context, room]);
  return (
    <div className="space-y-2 rounded-lg border border-hairline bg-page p-3 text-[13px] leading-[19px] text-ink" data-testid="how-it-reads">
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-[96px_96px_minmax(0,1fr)] sm:gap-3">
        <span className="font-bold">{clean(room.name)}</span>
        <span>{view.work}</span>
        <span className={view.muted ? "text-muted" : ""}>{view.text || "Nothing prints for this room yet."}</span>
      </div>
      {view.held.length > 0 && <p className="text-xs text-muted">Not printed: {view.held.join("; ")}.</p>}
    </div>
  );
}

export default function RoomBriefCard({ reg, room, context, upsertItem, updateItem, deleteItem, mutateMeta, readOnly, compact = false, onOpenRoom, addItem, onTypingChange, headingRef }) {
  const seedId = useRef(genId());
  const mhIds = useRef({});
  const [moreRooms, setMoreRooms] = useState(false);
  const [reads, setReads] = useState(false);
  const brief = room ? roomBriefRecord(reg, room) : null;
  const [showWho, setShowWho] = useState(() => !!(brief?.answer?.usedBy?.length || brief?.quantity != null));
  if (!room) return null;
  // The signed contract fixes the brief's words, chips and size (the server refuses a change): show them, don't offer them.
  const fixed = contractFixed(brief);
  const off = readOnly || fixed;
  const rooms = reg.meta.rooms || [];
  const seed = briefSeed(room, seedId.current);
  const writeBrief = (partial) => (brief ? updateItem(brief.id, partial) : upsertItem(seed, partial));
  const text = brief?.description || "";
  const has = hasRoomBrief(reg, room);
  const work = ROOM_SCOPES_WITH_WORK.has(room.scope);
  const connects = Array.isArray(brief?.answer?.connectsTo) ? brief.answer.connectsTo : [];
  const usedBy = Array.isArray(brief?.answer?.usedBy) ? brief.answer.usedBy : [];
  const cand = connectCandidates(rooms, room, connects.filter((c) => c !== "outside"));
  const fromOthers = connectedFrom(reg, room);
  const r004 = answerConfigFor(ROOM_BRIEF_PROMPT);
  const own = (qid) => reg.items.filter((i) => i.roomId === room.id && resolvePromptId(i.promptKey) === qid && !i.overridesDefaultId);
  const mustHaves = (ROOM_MUST_HAVES[room.roomType] || []).map((qid) => ({ q: questionById(qid), item: own(qid)[0] || null, cfg: answerConfigFor(qid) })).filter((m) => m.q && m.cfg);
  const ownChips = !mustHaves.length || (brief?.answer?.selected || []).some((s) => !s.stale);
  const mhSeed = (q) => { if (!mhIds.current[q.id]) mhIds.current[q.id] = genId(); return { ...roomSeed(q, room), id: mhIds.current[q.id] }; };
  const toggleList = (key, value) => writeBrief({ answer: toggleAnswerList(brief?.answer, key, value) });
  const caption = fixed ? { t: "Part of the signed contract — change it through a variation.", c: "font-bold text-ink" }
    : has ? { t: "In the architect's brief", c: "text-muted" }
    : work ? { t: "Needed before the architect's brief can go", c: "font-bold text-amber-800" } : { t: "No brief needed", c: "text-muted" };
  const typing = (on) => onTypingChange?.(on);
  const rename = (v) => { const next = renameRoomMeta(rooms, room.id, v); if (next !== rooms) mutateMeta({ rooms: next }); };

  const box = (
    <div className="space-y-1.5">
      <label htmlFor={`room-brief-${room.id}`} className={label13}>What must this room do?</label>
      <AutoTextarea id={`room-brief-${room.id}`} value={text} disabled={off} spellCheck enterKeyHint="done" rows={3}
        onChange={(e) => writeBrief({ description: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }}
        onFocus={(e) => { typing(true); const el = e.currentTarget; setTimeout(() => { try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { /* old browser */ } }, 300); }}
        onBlur={() => typing(false)}
        placeholder="Who uses it, what happens here, what it must be near or keep. Their words are fine."
        className="block w-full resize-none rounded-lg border border-hairline bg-surface px-3 py-2.5 text-base leading-[22px] text-ink placeholder:text-muted focus:border-primary focus:outline-none disabled:bg-page disabled:text-ink sm:text-[15px]"
        data-testid="room-brief-text" />
      {compact && fixed && <p className="text-[13px] font-bold text-ink" data-testid="brief-fixed">Part of the signed contract — change it through a variation.</p>}
      {isUnfinished(text) && <p className="text-[13px] font-bold text-amber-800">Looks unfinished — it won&apos;t print until it&apos;s finished.</p>}
      {!clean(text) && !off && (
        <div className="pt-1"><ChoiceChip tone="add" onClick={() => writeBrief({ description: standardBriefText(room) })} testId="standard-room">Nothing special — standard room</ChoiceChip></div>
      )}
    </div>
  );

  const connectsTo = (
    <div className="space-y-2">
      <p className={label13}>Connects to</p>
      <div className="flex flex-wrap gap-2">
        {[...cand.shown, ...(moreRooms ? cand.more : [])].map((r) => (
          <ChoiceChip key={r.id} on={connects.includes(r.id)} disabled={off} onClick={() => toggleList("connectsTo", r.id)}>{clean(r.name)}</ChoiceChip>
        ))}
        <ChoiceChip on={connects.includes("outside")} disabled={off} onClick={() => toggleList("connectsTo", "outside")}>Outside</ChoiceChip>
        {cand.more.length > 0 && !moreRooms && <ChoiceChip tone="add" onClick={() => setMoreRooms(true)}>+ More rooms</ChoiceChip>}
      </div>
      {fromOthers.length > 0 && <p className="text-[13px] text-muted">{fromOthers.map((r) => `Connects to ${clean(r.name)} (set from the ${clean(r.name)})`).join(" · ")}</p>}
    </div>
  );

  const musts = (mustHaves.length > 0 || ownChips) && (
    <div className="space-y-3">
      <p className={label13}>Must-haves</p>
      {mustHaves.map(({ q, item, cfg }) => {
        const it = item || makeItem(mhSeed(q));
        return (
          <div key={q.id} className="space-y-1.5">
            <p className="text-xs text-muted" title={q.text}>{q.short}</p>
            <ChoiceChips qid={q.id} config={cfg} item={it} disabled={readOnly || contractFixed(it)}
              onPatch={(p) => (item ? updateItem(item.id, p) : upsertItem(mhSeed(q), p))} />
          </div>
        );
      })}
      {ownChips && r004 && (
        <ChoiceChips qid={ROOM_BRIEF_PROMPT} config={r004} item={brief || makeItem(seed)} disabled={off} onPatch={writeBrief} showNoted={false} />
      )}
    </div>
  );

  if (compact) {
    return (
      <div className="space-y-4" data-testid="room-brief-compact">
        <label className="block space-y-1.5"><span className={label13}>Room name</span>
          <NameInput value={room.name} disabled={readOnly} onCommit={rename} className={inputCls} aria-label="Room name" />
        </label>
        <FloorChips reg={reg} room={room} mutateMeta={mutateMeta} readOnly={readOnly} />
        <div className="space-y-1.5"><p className={label13}>Work</p>
          <WorkControl full room={room} readOnly={readOnly} onChange={(k) => mutateMeta({ rooms: setRoomScope(rooms, room.id, k) })} />
        </div>
        <EarlierAnswerBanner reg={reg} room={room} mutateMeta={mutateMeta} deleteItem={deleteItem} addItem={addItem} readOnly={readOnly} />
        {box}
        {connectsTo}
        {musts}
        {onOpenRoom && <button type="button" onClick={() => onOpenRoom(room.id)} className={textBtn} data-testid="open-full-room">Open the full room ›</button>}
      </div>
    );
  }

  return (
    <section aria-labelledby={`brief-title-${room.id}`} className="space-y-4 rounded-card border border-l-[3px] border-hairline border-l-primary bg-surface p-4" data-testid="room-brief-card">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`brief-title-${room.id}`} ref={headingRef} tabIndex={-1} className="text-[17px] font-bold text-ink focus:outline-none">Room brief</h2>
        <span className={`text-xs ${caption.c}`} data-testid="brief-caption">{caption.t}</span>
      </div>
      {box}
      {connectsTo}
      {musts}
      {!showWho ? (
        <button type="button" aria-expanded={false} onClick={() => setShowWho(true)} className={textBtn}>+ Who uses it · Rough size</button>
      ) : (
        <div className="space-y-3">
          <ChipLine heading="Who uses it">
            {Object.entries(ROOM_USED_BY).map(([k, l]) => <ChoiceChip key={k} on={usedBy.includes(k)} disabled={off} onClick={() => toggleList("usedBy", k)}>{l}</ChoiceChip>)}
          </ChipLine>
          <label className="flex items-center gap-2">
            <span className="text-xs text-muted">Rough size</span>
            <input type="number" inputMode="decimal" min="0" step="any" disabled={off} value={brief?.quantity ?? ""} aria-label="Rough size in square metres"
              onChange={(e) => { const v = e.target.value; writeBrief(v === "" ? { quantity: null, unit: brief?.unit === "m²" ? "" : brief?.unit || "" } : { quantity: Number(v), unit: "m²" }); }}
              className="inp min-h-[44px] w-24 px-3 text-[16px] sm:text-sm" />
            <span className="text-sm text-ink">m²</span>
          </label>
        </div>
      )}
      <div className="-mx-4 -mb-4 border-t border-hairline px-4 pb-2">
        <button type="button" aria-expanded={reads} onClick={() => setReads((v) => !v)}
          className="flex min-h-[44px] w-full items-center justify-between text-left text-[13px] font-bold text-ink">
          <span><span className="sm:hidden">How this room reads</span><span className="hidden sm:inline">How this room reads in the architect&apos;s brief</span></span>
          <span aria-hidden="true" className={`text-muted transition ${reads ? "rotate-90" : ""}`}>▸</span>
        </button>
        {reads && <div className="pb-2"><HowItReads reg={reg} context={context} room={room} /></div>}
      </div>
    </section>
  );
}

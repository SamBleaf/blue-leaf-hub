/**
 * HouseStrip — "Same as the rest of the house" on a room screen (REGISTER_SCREENS_SPEC.md S3 card 6, S3p).
 *
 * One page-grey strip in place of the old "From Whole House" panel: a one-line summary of what this room takes from the
 * house (roomInheritedLines), "✓ Confirmed 16 Nov" or "Confirm all (n)" (the room's default confirmations, as before), and
 * "Different here", which lists each house line with its own "Different here" (a room exception, the existing logic).
 *
 * Under it, one line per house choice zoned to this room that is still open (amber) or not allowed (red, the K-005
 * engineered-stone default). Its button opens that house record (onOpenItem, or here in place); it never edits other rooms.
 * On a phone the strip opens a bottom sheet with the lines; the red and amber lines stay visible under it.
 */
import { useState } from "react";
import { confirmRoomDefaults, questionById, answerSummary } from "../../../../lib/register.js";
import { clean, lowerFirst, chipWords } from "../../../../lib/briefModel.js";
import { stripView, exceptionSeedFrom, shortName, patchRoom } from "../../../../lib/roomScreen.js";
import { NeedsActionFlag } from "./NeedsAction.jsx";
import ChoiceRow from "./ChoiceRow.jsx";
import { Popover } from "./RoomUi.jsx";
import { useNarrow } from "./useRoomUi.js";

const STATUS = { inherited: "To confirm", confirmed: "Confirmed", changed: "Changed since confirmed", overridden: "Different here" };
const textBtn = "focus-ring inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded px-2 text-sm font-bold text-primary hover:underline disabled:opacity-40";
const wordsOf = (def) => clean(def.description) || chipWords(def) || answerSummary(def) || clean(def.product) || "Set";

export default function HouseStrip({ reg, room, questions, mutateMeta, upsertItem, updateItem, actor, readOnly, onOpenItem, context, deleteItem, saveState }) {
  const narrow = useNarrow();
  const [list, setList] = useState(false);
  const [editing, setEditing] = useState(null);
  if (!room || room.scope === "not_in_scope") return null;
  const S = stripView(reg, room, questions);
  if (!S.lines.length && !S.houseLines.length) return null;
  const who = actor?.full_name || actor?.email || "Blue Leaf";
  const confirmAll = () => {
    const next = confirmRoomDefaults(room, S.pending.map((l) => l.def), { at: new Date().toISOString(), by: who });
    mutateMeta({ rooms: patchRoom(reg.meta.rooms, room.id, { defaultConfirmations: next.defaultConfirmations }) });
  };
  const differentHere = (line) => upsertItem(exceptionSeedFrom(line, room), {});
  const open = (h) => (onOpenItem ? onOpenItem(h.item.id) : setEditing((e) => (e === h.item.id ? null : h.item.id)));
  const held = new Set(S.houseLines.map((h) => h.item.id));

  const lines = (
    <ul className="divide-y divide-hairline" data-testid="house-lines">
      {S.lines.filter((l) => !held.has(l.def.id)).map((l) => {
        const key = `${l.question.id}:${l.def.id}`;
        return (
          <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2">
            <span className="min-w-0 flex-1 text-[15px] text-ink sm:text-sm">
              <span className="font-bold">{l.surface || shortName(l.question)}:</span> {lowerFirst(l.exception ? wordsOf(l.exception) : wordsOf(l.def))}
              <span className="block text-xs text-muted">{STATUS[l.status]}{l.exception ? ` · the house has ${lowerFirst(wordsOf(l.def))}` : ""}</span>
            </span>
            {!l.exception && !readOnly && <button type="button" className={textBtn} onClick={() => differentHere(l)} data-testid={`different-${key}`}>Different here</button>}
          </li>
        );
      })}
    </ul>
  );
  const confirmBtn = S.pending.length > 0 && !readOnly && (
    <button type="button" onClick={confirmAll} data-testid="confirm-room-defaults"
      className="focus-ring inline-flex min-h-[44px] shrink-0 items-center rounded-lg bg-primary px-3 text-sm font-bold text-white hover:opacity-90">Confirm all ({S.pending.length})</button>
  );
  const confirmed = !S.pending.length && S.confirmedOn && <span className="shrink-0 whitespace-nowrap text-[13px] font-bold text-accent">✓ Confirmed {S.confirmedOn}</span>;

  return (
    <section aria-labelledby={`house-${room.id}`} className="space-y-2 rounded-card border border-hairline bg-page px-3 pb-3 pt-1" data-testid="house-strip">
      {narrow ? (
        <button type="button" onClick={() => setList(true)} className="flex min-h-[56px] w-full items-center gap-2 text-left">
          <span className="min-w-0 flex-1">
            <span id={`house-${room.id}`} className="block text-[15px] font-bold text-ink">Same as the rest of the house</span>
            {S.summary && <span className="block truncate text-[13px] text-muted">{S.summary}</span>}
          </span>
          <span className={`shrink-0 text-[13px] font-bold ${S.pending.length ? "text-primary" : "text-accent"}`}>
            {S.pending.length ? `Confirm ${S.pending.length}` : S.confirmedCount ? `✓ ${S.confirmedCount} confirmed` : ""} ›
          </span>
        </button>
      ) : (
        <div className="flex min-h-[56px] items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={`house-${room.id}`} className="text-sm font-bold text-ink">Same as the rest of the house</h2>
            {S.summary && <p className="truncate text-[13px] text-muted" title={S.summary}>{S.summary}</p>}
          </div>
          {confirmed}{confirmBtn}
          {S.lines.length > 0 && <button type="button" aria-expanded={list} onClick={() => setList((v) => !v)} className={textBtn}>Different here</button>}
        </div>
      )}
      {!narrow && list && <div className="rounded-lg border border-hairline bg-surface px-3">{lines}</div>}
      {narrow && (
        <Popover open={list} onClose={() => setList(false)} narrow title="Same as the rest of the house">
          <div className="space-y-2 pb-2">
            {confirmBtn}
            {confirmed}
            {lines}
          </div>
        </Popover>
      )}

      {S.houseLines.map((h) => {
        const red = h.tone === "red";
        const q = questionById(h.sourceId) || h.question;
        return (
          <div key={h.item.id} data-testid={`house-line-${h.item.id}`}>
            <div className={`flex items-center gap-3 rounded-lg py-0.5 pl-3 pr-1 ${red ? "border border-red-200 bg-red-50" : "bg-warning/10"}`}>
              <span className={`min-w-0 flex-1 text-[15px] leading-5 sm:text-sm ${red ? "text-red-700" : "text-amber-800"}`}>{narrow ? h.shortText : h.text}</span>
              <button type="button" onClick={() => open(h)} className={textBtn}>{h.action}</button>
            </div>
            <div className="pl-3"><NeedsActionFlag reg={reg} context={context} item={h.item} updateItem={updateItem} upsertItem={upsertItem} readOnly={readOnly} /></div>
            {editing === h.item.id && (
              <div className="mt-1 rounded-lg border border-hairline bg-surface">
                <p className="px-4 pt-3 text-xs text-muted">This is the house record{h.item.answer?.zone?.label ? ` for the ${lowerFirst(h.item.answer.zone.label)}` : ""}. A change here is a change for the whole house.</p>
                <ChoiceRow reg={reg} context={context} question={q} item={h.item} seed={{ id: h.item.id }} room={null} fixedZone
                  upsertItem={upsertItem} updateItem={updateItem} deleteItem={deleteItem} readOnly={readOnly} saveState={saveState} actor={actor} />
                <div className="px-4 pb-2"><button type="button" onClick={() => setEditing(null)} className={textBtn}>Done</button></div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

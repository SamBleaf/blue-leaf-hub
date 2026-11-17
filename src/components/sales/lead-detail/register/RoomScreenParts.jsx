/**
 * RoomScreenParts — the cards of a room screen below the room brief (REGISTER_SCREENS_SPEC.md S3 cards 5, 7 and 8, S3p):
 *   ChoicesCard        "Choices for this room": the primary rows, "More choices (n) ▾", and last "Office only (n) ▸"
 *   ActionsInRoom      "Actions in this room": the room's open points (briefModel.openPoints, the Actions rule), ✓ to
 *                      close one, and "+ Needs action from…" (a new follow-up for this room with "What's needed?" focused)
 *   OtherRecorded      "Other things recorded here (n) ▸": every record of the room no row shows, each with Remove
 *
 * Which question goes in which group, and what no row shows, is roomLayout() in src/lib/roomScreen.js; this file only
 * draws it. Repeat questions keep one row per record (ChoiceRepeat / ApplianceRow) with their repeat keys.
 */
import { useRef, useState } from "react";
import { genId, answerConfigFor, questionById, resolvePromptId } from "../../../../lib/register.js";
import { clean } from "../../../../lib/briefModel.js";
import { pointSubject, pointLine, pointTags, pointKey, donePatch, checkedPatch, undoPatchFor, isLocked } from "../../../../lib/needsAction.js";
import { roomSeed, isExistingWorksRow, existingWorksFor, existingWorkSeed, otherWords, readdable, contractFixed, actionSeed } from "../../../../lib/roomScreen.js";
import ChoiceRow, { ChoiceRepeat, ApplianceRow } from "./ChoiceRow.jsx";
import PromptRow from "./PromptRow.jsx";
import { NeedsActionFlag, NeedsActionSheet, ActionToast } from "./NeedsAction.jsx";
import { IconButton, MenuItem, Popover } from "./RoomUi.jsx";
import { useNarrow } from "./useRoomUi.js";

const h2 = "text-[17px] font-bold leading-6 text-ink";
const disclosure = "focus-ring flex min-h-[48px] w-full items-center justify-between gap-2 px-4 text-left text-[15px] font-bold sm:text-sm";
const Chevron = ({ open, down = false }) => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    className={`shrink-0 transition ${open ? (down ? "rotate-180" : "rotate-90") : ""}`}>
    {down ? <path d="M6 9l6 6 6-6" /> : <path d="M9 6l6 6-6 6" />}
  </svg>
);

/**
 * One question's row(s). seedFor(q) gives an unanswered single question its stable seed (with an id), so a quick second
 * tap updates the record the first one made.
 */
function QuestionRows({ q, layout, room, rooms, reg, seedFor, row }) {
  const cfg = answerConfigFor(q.id);
  const items = layout.rowItems(q);
  if (isExistingWorksRow(q)) return <ExistingWorksRow q={q} own={items} room={room} rooms={rooms} reg={reg} row={row} />;
  if (cfg?.repeat?.key === "appliance") return <ApplianceRow question={q} items={items} seed={roomSeed(q, room)} {...row} />;
  if (cfg?.repeat) return <ChoiceRepeat question={q} items={items} seed={roomSeed(q, room)} {...row} />;
  if (items.some((i) => i.overridesDefaultId)) {
    return items.map((it) => (
      <ChoiceRow key={it.id} question={q} item={it} seed={{ ...roomSeed(q, room), id: it.id }} rowTitle={clean(it.answer?.zone?.label) ? `${q.short}: ${clean(it.answer.zone.label)}` : undefined} {...row} />
    ));
  }
  const item = items[0] || null;
  return <ChoiceRow question={q} item={item} seed={item ? { ...roomSeed(q, room), id: item.id } : seedFor(q)} {...row} />;
}

/**
 * The existing-works row (Tab 27 B06): the room's own older records, then the shared Site & existing records that name
 * this room, and "+ Existing work here", which starts one of those shared records with this room as its area.
 */
function ExistingWorksRow({ q, own, room, rooms, reg, row }) {
  const [adding, setAdding] = useState(null);
  const shared = existingWorksFor(reg, room);
  const w4 = questionById("W-004");
  const areaOptions = rooms.map((r) => ({ id: r.id, label: clean(r.name) }));
  const titleOf = (it) => `Existing works${clean(it?.answer?.element?.label) ? `: ${clean(it.answer.element.label)}` : ""}`;
  const open = adding && !shared.some((i) => i.id === adding) && !reg.items.some((i) => i.id === adding) ? adding : null;
  return (
    <div className="border-t border-hairline first:border-t-0" data-testid={`choice-row-${q.id}`}>
      <div className="px-4 pt-3">
        <p className="text-[15px] font-bold leading-5 text-ink sm:text-sm" title={q.text}>{q.short}</p>
        <p className="text-[13px] text-muted">The same record as Site &amp; existing: a change here shows there.</p>
      </div>
      {own.map((it) => <ChoiceRow key={it.id} question={q} item={it} seed={{ ...roomSeed(q, room), id: it.id }} {...row} />)}
      {shared.map((it) => <ChoiceRow key={it.id} question={w4} item={it} seed={{ id: it.id }} areaOptions={areaOptions} rowTitle={titleOf(it)} {...row} room={null} />)}
      {open && <ChoiceRow key={open} question={w4} item={null} seed={existingWorkSeed(room, open)} areaOptions={areaOptions} rowTitle="Existing works" {...row} room={null} />}
      {!row.readOnly && !open && (
        <div className="px-4 pb-3 pt-2">
          <button type="button" onClick={() => setAdding(genId())} data-testid="add-existing-here"
            className="focus-ring inline-flex min-h-[44px] items-center rounded-full border border-dashed border-primary px-4 text-sm font-bold text-primary hover:bg-primary/5">+ Existing work here</button>
        </div>
      )}
    </div>
  );
}

/** "Choices for this room": flat one-line rows; detail one tap away under "More choices"; office-only last and collapsed. */
export function ChoicesCard({ layout, room, rooms, reg, seedFor, row }) {
  const [more, setMore] = useState(false);
  const [office, setOffice] = useState(false);
  const { primary, more: extra, office: officeQs } = layout;
  if (!primary.length && !extra.length && !officeQs.length) return null;
  const rowsOf = (list) => list.map((q) => <QuestionRows key={`${room.id}:${q.id}`} q={q} layout={layout} room={room} rooms={rooms} reg={reg} seedFor={seedFor} row={row} />);
  const officeGroup = officeQs.length > 0 && (
    <div className="border-t border-hairline">
      <button type="button" aria-expanded={office} onClick={() => setOffice((v) => !v)} className={`${disclosure} text-muted`} data-testid="office-only">
        <span>Office only ({officeQs.length})</span><Chevron open={office} />
      </button>
      {office && <div className="bg-page/40">{rowsOf(officeQs)}</div>}
    </div>
  );
  return (
    <section aria-labelledby={`choices-${room.id}`} className="rounded-card border border-hairline bg-surface" data-testid="choices-card">
      <h2 id={`choices-${room.id}`} className={`${h2} px-4 pb-1 pt-4`}>Choices for this room</h2>
      {primary.length > 0 ? rowsOf(primary) : <p className="px-4 pb-3 text-[13px] text-muted">Nothing else to choose here first. More is below.</p>}
      {extra.length > 0 ? (
        <div className="border-t border-hairline">
          <button type="button" aria-expanded={more} onClick={() => setMore((v) => !v)} className={`${disclosure} text-primary`} data-testid="more-choices">
            <span>More choices ({extra.length})</span><Chevron open={more} down />
          </button>
          {more && <div>{rowsOf(extra)}{officeGroup}</div>}
        </div>
      ) : officeGroup}
    </section>
  );
}

function TickIcon() {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>;
}
const TAG = { amber: "bg-warning/[0.12] text-amber-800", red: "border border-red-200 bg-red-50 text-red-700" };

/** "Actions in this room": one row per open point of this room, the same rule the Actions list and the brief use. */
export function ActionsInRoom({ reg, context, actor, room, points, updateItem, upsertItem, readOnly }) {
  const [sheet, setSheet] = useState(null);       // { seed } for a new follow-up
  const [checking, setChecking] = useState(null); // a point key asking for its drawing reference
  const [refText, setRefText] = useState("");
  const [toast, setToast] = useState(null);
  const addBtn = useRef(null);
  const byId = new Map(reg.items.map((i) => [i.id, i]));
  const by = actor?.full_name || actor?.email || "Blue Leaf";
  const save = (id, patch) => updateItem(id, patch);
  const close = (p, patchFor, words) => {
    const items = p.ids.map((id) => byId.get(id)).filter(Boolean);
    const undo = items.map((it) => [it.id, undoPatchFor(it, patchFor(it))]);
    for (const it of items) save(it.id, patchFor(it));
    setChecking(null); setRefText("");
    setToast({ id: genId(), text: words, undo: () => { for (const [id, patch] of undo) save(id, patch); } });
  };
  const tick = (p) => {
    if (p.item.technicalStatus === "needs_verification") { setChecking((c) => (c === pointKey(p) ? null : pointKey(p))); setRefText(""); return; }
    close(p, () => donePatch(), "Marked done.");
  };
  const sheetItem = sheet ? byId.get(sheet.seed.id) || null : null;
  return (
    <section aria-labelledby={`actions-${room.id}`} className="space-y-2 rounded-card border border-hairline bg-surface p-4" data-testid="room-actions">
      <h2 id={`actions-${room.id}`} className={h2}>Actions in this room</h2>
      {points.length === 0 ? <p className="text-[15px] leading-5 text-muted sm:text-sm">Nothing waiting on anyone here.</p> : (
        <ul className="-mx-4 border-t border-hairline">
          {points.map((p) => {
            const line = pointLine(p);
            const tags = pointTags(p);
            const k = pointKey(p);
            const locked = isLocked(p.item);
            const technical = p.item.technicalStatus === "needs_verification";
            return (
              <li key={k} className="border-b border-hairline px-4 py-2" data-testid={`room-action-${k}`}>
                <div className="flex min-h-[44px] items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-5 text-ink">{pointSubject(p)}</p>
                    <p className={`text-[13px] leading-[18px] ${line.tone === "amber" ? "text-amber-800" : "text-ink"}`}>{line.text}</p>
                    {tags.map((t) => <span key={t.text} className={`mt-1 inline-block rounded-xl px-2 py-[3px] text-xs font-bold leading-4 ${TAG[t.tone]}`}>{t.text}</span>)}
                  </div>
                  <NeedsActionFlag reg={reg} context={context} actor={actor} item={p.item} updateItem={updateItem} upsertItem={upsertItem} readOnly={readOnly} />
                  {!locked && !readOnly && (
                    <button type="button" onClick={() => tick(p)} aria-label={`${technical ? "Mark checked" : "Mark done"}: ${pointSubject(p)}`} aria-expanded={technical ? checking === k : undefined}
                      className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface text-accent hover:bg-page"><TickIcon /></button>
                  )}
                </div>
                {checking === k && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <label className="text-xs font-bold uppercase tracking-[0.06em] text-muted" htmlFor={`ref-${k}`}>Drawing or document reference</label>
                    <div className="flex gap-2">
                      <input id={`ref-${k}`} autoFocus value={refText} onChange={(e) => setRefText(e.target.value)} placeholder="e.g. A301 Rev D detail 4"
                        onKeyDown={(e) => { if (e.key === "Enter" && refText.trim()) close(p, (it) => (it.technicalStatus === "needs_verification" ? checkedPatch(it, { ref: refText, by }) : donePatch()), "Marked checked."); if (e.key === "Escape") setChecking(null); }}
                        className="focus-ring h-11 min-w-0 flex-1 rounded-lg border border-hairline bg-surface px-3 text-base text-ink sm:text-sm" />
                      <button type="button" disabled={!refText.trim()} onClick={() => close(p, (it) => (it.technicalStatus === "needs_verification" ? checkedPatch(it, { ref: refText, by }) : donePatch()), "Marked checked.")}
                        className="focus-ring h-11 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-40">Save</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!readOnly && (
        <button ref={addBtn} type="button" onClick={() => setSheet({ seed: actionSeed(room, genId()) })} data-testid="room-add-action"
          className="focus-ring inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-dashed border-primary bg-surface px-4 text-sm font-bold text-primary hover:bg-primary/5 sm:w-auto">
          + Needs action from…
        </button>
      )}
      {sheet && (
        <NeedsActionSheet key={sheet.seed.id} reg={reg} context={context} actor={actor} item={sheetItem} seed={sheetItem ? null : sheet.seed}
          updateItem={updateItem} upsertItem={upsertItem} anchor={addBtn} focusWhat onClose={() => setSheet(null)} onNotify={setToast} />
      )}
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />
    </section>
  );
}

/** One record no row shows: its words, and ⋯ with "Show details" (the full record) and "Remove" (with Undo). */
function OtherRow({ reg, room, item, actor, saveState, updateItem, deleteItem, onPortalItem, readOnly, onRemoved }) {
  const narrow = useNarrow();
  const [menu, setMenu] = useState(false);
  const [details, setDetails] = useState(false);
  const btn = useRef(null);
  const fixed = contractFixed(item);
  const remove = () => {
    setMenu(false);
    deleteItem(item.id);
    onRemoved(item);
  };
  return (
    <li className="border-t border-hairline px-4 py-2 first:border-t-0" data-testid={`other-${item.id}`}>
      <div className="flex min-h-[44px] items-center gap-2">
        <p className="min-w-0 flex-1 text-[15px] leading-5 text-ink sm:text-sm">{otherWords(reg, room, item)}</p>
        <span className="relative">
          <IconButton label="More for this record" buttonRef={btn} expanded={menu} onClick={() => setMenu((v) => !v)} />
          <Popover open={menu} onClose={() => setMenu(false)} narrow={narrow} anchorRef={btn} title={narrow ? "This record" : undefined}>
            <div role="menu">
              <MenuItem checked={details} onClick={() => { setDetails((v) => !v); setMenu(false); }}>Show details</MenuItem>
              {!readOnly && !fixed && <MenuItem danger onClick={remove}>Remove</MenuItem>}
              {fixed && <MenuItem disabled hint="Change it through a variation.">Part of the signed contract</MenuItem>}
            </div>
          </Popover>
        </span>
      </div>
      {details && (
        <div className="mt-1 rounded-lg border border-hairline bg-page p-2">
          <PromptRow question={questionById(resolvePromptId(item.promptKey)) || null} item={item} actor={actor} readOnlyReason={readOnly ? "Read-only" : null} saveState={saveState}
            onChange={(partial) => updateItem(item.id, partial)} onDelete={!readOnly && !fixed ? () => { deleteItem(item.id); onRemoved(item); } : null}
            onPortal={onPortalItem ? (action, ev) => onPortalItem(item, action, ev) : null} />
        </div>
      )}
    </li>
  );
}

/** "Other things recorded here (n) ▸": shown only when a record of the room has no row of its own. */
export function OtherRecorded({ reg, room, items, actor, saveState, updateItem, deleteItem, addItem, onPortalItem, readOnly, onToast }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const onRemoved = (item) => onToast?.("Removed.", addItem ? () => addItem(readdable(item)) : null);
  return (
    <section className="rounded-card border border-hairline bg-surface" data-testid="other-recorded">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={`${disclosure} text-muted`}>
        <span>Other things recorded here ({items.length})</span><Chevron open={open} />
      </button>
      {open && (
        <ul className="border-t border-hairline">
          {items.map((i) => <OtherRow key={i.id} reg={reg} room={room} item={i} actor={actor} saveState={saveState} updateItem={updateItem} deleteItem={deleteItem}
            onPortalItem={onPortalItem} readOnly={readOnly} onRemoved={onRemoved} />)}
        </ul>
      )}
    </section>
  );
}

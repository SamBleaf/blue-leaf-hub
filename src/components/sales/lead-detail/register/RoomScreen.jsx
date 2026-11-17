/**
 * RoomScreen — one room (REGISTER_SCREENS_SPEC.md S3 tablet, S3p phone; owner approval 17 Nov 2026). One column at every
 * width, in this order:
 *   1 sticky room bar   "‹ Rooms" · name over "Ground floor ▾ · Room 4 of 16" · save state (phone: ‹ · name over
 *                       "Ground floor · 4 of 16 · Saved" · ⋯ with "‹ Previous room" and "Floor ▸"). No ‹ › buttons.
 *   2 Work              the room's one Work word, saved on tap; ⋯ Not in this job · Room details · Duplicate · Remove
 *   3 earlier answer    an earlier whole-room answer that disagrees (EarlierAnswerBanner)
 *   4 Room brief        RoomBriefCard
 *   5 Choices           ChoicesCard (primary rows, More choices, Office only)
 *   6 House strip       "Same as the rest of the house"
 *   7 Actions           the room's open points; "+ Needs action from…"
 *   8 Other things      every record no row shows
 *   9 sticky footer     "‹ Dining" · "Next: Pantry ›" (last: "Done — back to Rooms"); saves first, stays on failure
 * Work = No change: cards 4 and 5 become one line. Not in this job: only the bar and "Bring it back" (with anything still
 * recorded under "Other things recorded here", so nothing is hidden).
 *
 * Hidden whole-room scope questions are never asked: their records show in the banner (disagree) or under "Other things
 * recorded here" (agree). Where every record goes is roomLayout() in src/lib/roomScreen.js (tested on the real job).
 *
 * The room bar owns the save state on a room screen (spec S3 correction): the worst of the room's records and of the
 * room-level (meta) save, metaState, with the store's last save time, saveAt. onOpenRecord(id) opens a record in the
 * edit drawer (the house strip's Change / Open; "Other things recorded here" › Show details passes { details: true }
 * so Product details opens). A room holding records on the client portal or in the contract can't
 * be removed: its menu offers "Not in this job" instead.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { genId, ROOM_SCOPES, ROOM_WORK_WORDS } from "../../../../lib/register.js";
import { clean, openPoints, floorLabel } from "../../../../lib/briefModel.js";
import {
  roomLayout, roomPosition, roomSaveState, saveWords, flushWithin, setRoomScope, duplicateRoomMeta, removeRoomPlan, removeRoomText, duplicatedText,
  roomSeed, canRemoveRoom,
} from "../../../../lib/roomScreen.js";
import RoomBriefCard, { WorkControl, EarlierAnswerBanner, FloorChips } from "./RoomBriefCard.jsx";
import HouseStrip from "./HouseStrip.jsx";
import { ChoicesCard, ActionsInRoom, OtherRecorded } from "./RoomScreenParts.jsx";
import { RoomDetails } from "./RoomEdit.jsx";
import { Confirm, IconButton, MenuDivider, MenuItem, Popover, Segmented, Spinner, Toast } from "./RoomUi.jsx";
import { storeGet, storeSet, useNarrow, useStageBarInset, useToast } from "./useRoomUi.js";

const textBtn = "focus-ring inline-flex min-h-[44px] items-center rounded-lg px-2.5 text-sm font-bold text-primary hover:bg-primary/5";
const isTextField = (el) => !!el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "range"].includes(el.type)) || el.isContentEditable);

export default function RoomScreen(props) {
  const { reg, roomId, onBack } = props;
  const room = (reg?.meta?.rooms || []).find((r) => r.id === roomId) || null;
  if (!room) {
    return (
      <div className="space-y-2 rounded-card border border-hairline bg-surface p-4">
        <p className="text-sm text-ink">This room has been removed.</p>
        <button type="button" onClick={onBack} className={textBtn}>‹ Rooms</button>
      </div>
    );
  }
  // Keyed by room: what is open, typed or waiting on one room never carries into the next.
  return <RoomView key={room.id} {...props} room={room} />;
}

function RoomView({ reg, context, stage, room, actor, upsertItem, updateItem, deleteItem, addItem, replaceItems, mutateMeta, saveState, metaState, saveAt, onPortalItem, flush, onBack, onOpenRoom, onOpenRecord }) {
  const narrow = useNarrow();
  const stageInset = useStageBarInset();
  const rootRef = useRef(null);
  const headingRef = useRef(null);
  const workMenuBtn = useRef(null);
  const barMenuBtn = useRef(null);
  const floorBtn = useRef(null);
  const mounted = useRef(true);
  const seedIds = useRef(new Map());
  const usedIds = useRef(new Set());
  const { toast, show, clear } = useToast();
  const [menu, setMenu] = useState(null);          // null | "work" | "bar" | "floor" | "details" | "remove" — the room's ⋯ and floor menus
  const [moving, setMoving] = useState(false);
  const [notSaved, setNotSaved] = useState(null);  // { to } after a save that didn't go through
  const [typing, setTyping] = useState(false);
  const [bringBack, setBringBack] = useState(false);
  const rooms = reg.meta.rooms || [];
  const name = clean(room.name) || "Room";
  const out = room.scope === "not_in_scope";
  const readOnly = false;

  useEffect(() => {
    mounted.current = true;
    const el = rootRef.current;
    try { if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" }); } catch { /* old browser */ }
    return () => { mounted.current = false; };
  }, []);

  const points = useMemo(() => openPoints(reg, context, { scope: "all" }), [reg, context]);
  const layout = useMemo(() => roomLayout(reg, context, room, { projectType: context?.projectType || "", stage, points }), [reg, context, room, stage, points]);
  const pos = roomPosition(rooms, room.id);

  // The room bar's save state: the worst of this room's records and the room-level save, with the store's last save
  // time (so it reads "Saved 9:41 pm" on first open), else the time it last became saved here.
  const roomItems = reg.items.filter((i) => i.roomId === room.id);
  const agg = roomSaveState(roomItems, saveState, metaState || "saved");
  const [seenAgg, setSeenAgg] = useState(agg);
  const [savedAt, setSavedAt] = useState(null);
  if (agg !== seenAgg) { setSeenAgg(agg); if (agg === "saved") setSavedAt(new Date()); }
  const sw = saveWords({ state: agg, at: agg === "saved" ? (saveAt || savedAt) : null });
  const removable = canRemoveRoom(reg, room);
  const swTone = { ok: "text-accent", muted: "text-muted", warn: "font-bold text-amber-800", error: "font-bold text-red-700" }[sw?.tone] || "text-muted";

  // A question not answered yet keeps one id until its record exists; an id that has been used is never offered again.
  const present = new Set(reg.items.map((i) => i.id));
  for (const id of seedIds.current.values()) if (present.has(id)) usedIds.current.add(id);
  const seedFor = (q) => {
    let id = seedIds.current.get(q.id);
    if (!id || (usedIds.current.has(id) && !present.has(id))) { id = genId(); seedIds.current.set(q.id, id); }
    return { ...roomSeed(q, room), id };
  };

  const editRooms = (fn) => (replaceItems
    ? replaceItems((cur) => ({ ...cur, meta: { ...cur.meta, rooms: fn(cur.meta.rooms || []) } }))
    : mutateMeta({ rooms: fn(rooms) }));
  const prevKey = `register.room.prevScope.${room.id}`;
  const setScope = (k) => {
    if (k === room.scope) return;
    if (k === "not_in_scope") storeSet(prevKey, room.scope, true);
    const before = room.scope;
    editRooms((list) => setRoomScope(list, room.id, k));
    if (k === "not_in_scope") show(`${name} is marked not part of this job.`, () => editRooms((list) => setRoomScope(list, room.id, before)));
  };
  const bringItBack = () => {
    const prev = storeGet(prevKey, null, true);
    if (ROOM_WORK_WORDS.includes(prev)) { editRooms((list) => setRoomScope(list, room.id, prev)); storeSet(prevKey, null, true); } else setBringBack(true);
  };
  const duplicate = () => {
    let made = null, source = null;
    editRooms((list) => { const r = duplicateRoomMeta(list, room.id); made = r.room; source = r.source; return r.rooms; });
    setMenu(null);
    if (made) { const id = made.id; show(duplicatedText(made, source), () => replaceItems?.(removeRoomPlan(id))); }
  };
  const remove = () => { setMenu(null); if (!removable) return; replaceItems?.(removeRoomPlan(room.id)); onBack?.(); };

  async function go(targetId) {
    if (moving) return;
    setNotSaved(null);
    if (flush) {
      setMoving(true);
      const ok = await flushWithin(flush, { ms: 8000 });
      if (!mounted.current) return;
      setMoving(false);
      if (!ok) { setNotSaved({ to: targetId }); return; }
    }
    if (targetId) onOpenRoom?.(targetId); else onBack?.();
  }
  const carryOn = () => { const to = notSaved?.to; setNotSaved(null); if (to) onOpenRoom?.(to); else onBack?.(); };

  // ── menus ──
  const closeMenu = () => setMenu(null);
  const roomMenuItems = (phone) => (
    <div role="menu">
      {phone && pos.prev && <MenuItem onClick={() => { closeMenu(); go(pos.prev.id); }}>‹ Previous room: {clean(pos.prev.name)}</MenuItem>}
      {phone && <MenuItem chevron onClick={() => setMenu("floor")}>Floor: {floorLabel(room.level)}</MenuItem>}
      {phone && <MenuDivider />}
      {out ? <MenuItem onClick={() => { closeMenu(); bringItBack(); }}>Bring it back</MenuItem> : <MenuItem onClick={() => { closeMenu(); setScope("not_in_scope"); }}>Not in this job</MenuItem>}
      <MenuItem onClick={() => setMenu("details")}>{phone ? "Room details" : "Room details (name, type, drawing sheet)"}</MenuItem>
      <MenuItem onClick={duplicate}>Duplicate room</MenuItem>
      <MenuDivider />
      {removable ? <MenuItem danger onClick={() => setMenu("remove")}>Remove room…</MenuItem>
        : <MenuItem disabled hint={out ? undefined : "Use “Not in this job” instead."} testId="room-remove-blocked">Can&apos;t remove: it holds items on the client portal or in the contract</MenuItem>}
    </div>
  );
  const menuBody = (phone) => (
    <>
      {(menu === "work" || menu === "bar") && roomMenuItems(phone)}
      {menu === "details" && <RoomDetails room={room} editRooms={editRooms} onDone={closeMenu} />}
      {menu === "remove" && removable && <Confirm text={removeRoomText(reg, room)} confirmLabel="Remove" onConfirm={remove} onCancel={closeMenu} />}
      {menu === "floor" && <div className="p-2"><FloorChips reg={reg} room={room} mutateMeta={mutateMeta} onDone={closeMenu} /></div>}
    </>
  );
  const menuTitle = { details: "Room details", remove: "Remove room", floor: "Floor" }[menu] || name;

  // ── 1 the room bar ──
  const saveText = sw && <span className={`whitespace-nowrap text-xs ${swTone}`} data-testid="room-save-state" aria-live="polite">{sw.text}</span>;
  const bar = narrow ? (
    <div className="sticky top-[65px] z-20 -mx-2 -mt-2 grid min-h-[52px] grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-1 border-b border-hairline bg-surface px-1 md:top-0" data-testid="room-bar">
      <button type="button" onClick={onBack} aria-label="Back to Rooms" className="focus-ring flex h-11 w-11 items-center justify-center rounded-lg text-xl font-bold text-primary">‹</button>
      <div className="min-w-0 text-center">
        <h2 className="truncate text-[17px] font-bold leading-[22px] text-ink">{name}</h2>
        <p className="truncate text-xs text-muted">{floorLabel(room.level)} · {pos.number} of {pos.total}{sw ? <> · <span className={swTone}>{agg === "saved" ? "Saved" : sw.text}</span></> : null}</p>
      </div>
      <span className="relative">
        <IconButton label={`More for ${name}`} buttonRef={barMenuBtn} expanded={!!menu} onClick={() => setMenu((m) => (m ? null : "bar"))} />
        <Popover open={!!menu} onClose={closeMenu} narrow anchorRef={barMenuBtn} title={menuTitle}>{menuBody(true)}</Popover>
      </span>
    </div>
  ) : (
    <div className="sticky top-[65px] z-20 -mx-2 -mt-2 grid min-h-[56px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-hairline bg-surface px-2 sm:-mx-4 sm:-mt-4 sm:px-3 md:top-0" data-testid="room-bar">
      <div><button type="button" onClick={onBack} className={textBtn} data-testid="room-back">‹ Rooms</button></div>
      <div className="min-w-0 text-center">
        <h2 className="truncate text-[17px] font-bold leading-[22px] text-ink">{name}</h2>
        <div className="text-[13px] leading-[18px] text-muted">
          <span className="relative inline-block">
            <button ref={floorBtn} type="button" aria-label={`Floor: ${floorLabel(room.level)}. Change floor`} aria-haspopup="dialog" aria-expanded={menu === "floor"} onClick={() => setMenu((m) => (m === "floor" ? null : "floor"))}
              className="focus-ring -my-[13px] inline-flex min-h-[44px] items-center rounded px-1 font-bold text-primary">{floorLabel(room.level)} ▾</button>
            <Popover open={menu === "floor"} onClose={closeMenu} anchorRef={floorBtn} align="left" title="Floor">
              <div className="p-2"><FloorChips reg={reg} room={room} mutateMeta={mutateMeta} onDone={closeMenu} /></div>
            </Popover>
          </span>
          {" "}· Room {pos.number} of {pos.total}
        </div>
      </div>
      <div className="flex justify-end pr-1">{saveText}</div>
    </div>
  );

  // ── 2 Work ──
  const workRow = !out && (
    <div className="flex min-h-[52px] items-center gap-2" data-testid="room-work">
      {!narrow && <span className="w-16 shrink-0 text-[13px] text-muted">Work</span>}
      <div className={narrow ? "w-full" : "min-w-0 flex-1 sm:max-w-[30rem]"}><WorkControl full room={room} readOnly={readOnly} onChange={setScope} minSegment={narrow ? 0 : 96} /></div>
      {!narrow && (
        <span className="relative">
          <IconButton label="More for this room" buttonRef={workMenuBtn} expanded={menu === "work" || menu === "details" || menu === "remove"}
            onClick={() => setMenu((m) => (m === "work" || m === "details" || m === "remove" ? null : "work"))} />
          <Popover open={menu === "work" || menu === "details" || menu === "remove"} onClose={closeMenu} anchorRef={workMenuBtn} wide={menu === "details"}>{menuBody(false)}</Popover>
        </span>
      )}
    </div>
  );

  const row = { reg, context, room, upsertItem, updateItem, deleteItem, readOnly, saveState, actor, onPortalItem, coveredQuestions: new Set(layout.questions.map((q) => q.id)) };
  const footerHidden = narrow && typing;
  const last = !pos.next;

  return (
    <div ref={rootRef} className="space-y-3" data-testid="room-screen"
      onFocus={(e) => { if (isTextField(e.target)) setTyping(true); }} onBlur={(e) => { if (isTextField(e.target)) setTyping(false); }}>
      {bar}

      {out ? (
        <div className="space-y-3 rounded-card border border-hairline bg-surface p-4" data-testid="room-out">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-[15px] text-ink sm:text-sm">This room isn&apos;t part of the job.</p>
            {!narrow && (
              <span className="relative">
                <IconButton label="More for this room" buttonRef={workMenuBtn} expanded={!!menu} onClick={() => setMenu((m) => (m ? null : "work"))} />
                <Popover open={!!menu && menu !== "floor"} onClose={closeMenu} anchorRef={workMenuBtn} wide={menu === "details"}>{menuBody(false)}</Popover>
              </span>
            )}
          </div>
          {!bringBack ? (
            <button type="button" onClick={bringItBack} className="focus-ring inline-flex min-h-[44px] items-center rounded-lg border border-primary px-4 text-sm font-bold text-primary hover:bg-primary/5" data-testid="bring-back">Bring it back</button>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[13px] text-muted">Bring it back as</p>
              <Segmented full label="Bring it back as" value={null} onChange={(k) => { setBringBack(false); editRooms((list) => setRoomScope(list, room.id, k)); }}
                options={ROOM_WORK_WORDS.map((k) => [k, ROOM_SCOPES[k]])} />
            </div>
          )}
        </div>
      ) : (
        <>
          {workRow}
          <EarlierAnswerBanner reg={reg} room={room} mutateMeta={mutateMeta} deleteItem={deleteItem} addItem={addItem} readOnly={readOnly}
            onSettled={() => setTimeout(() => { try { headingRef.current?.focus(); } catch { /* gone */ } }, 160)} />
          {layout.collapsed ? (
            <p className="rounded-card border border-hairline bg-surface p-4 text-[15px] text-muted sm:text-sm" data-testid="no-work">No work planned here — no brief needed.</p>
          ) : (
            <>
              <RoomBriefCard reg={reg} room={room} context={context} upsertItem={upsertItem} updateItem={updateItem} deleteItem={deleteItem} mutateMeta={mutateMeta} addItem={addItem}
                readOnly={readOnly} headingRef={headingRef} />
              <ChoicesCard layout={layout} room={room} rooms={rooms} reg={reg} seedFor={seedFor} row={row} />
            </>
          )}
          <HouseStrip reg={reg} room={room} questions={layout.questions} mutateMeta={mutateMeta} upsertItem={upsertItem} updateItem={updateItem} deleteItem={deleteItem}
            actor={actor} readOnly={readOnly} context={context} saveState={saveState} onOpenItem={onOpenRecord ? (id) => onOpenRecord(id) : undefined} />
          <ActionsInRoom reg={reg} context={context} actor={actor} room={room} points={layout.actions} updateItem={updateItem} upsertItem={upsertItem} readOnly={readOnly} />
        </>
      )}

      <OtherRecorded reg={reg} room={room} items={layout.other} actor={actor} saveState={saveState} updateItem={updateItem} deleteItem={deleteItem} addItem={addItem}
        onPortalItem={onPortalItem} readOnly={readOnly} onToast={show} onOpenRecord={onOpenRecord} />

      {/* 9 sticky footer: above the Hub's bottom nav on a phone, above the lead's stage bar wherever it shows */}
      <div className={`sticky bottom-[76px] z-20 -mx-2 -mb-2 border-t border-hairline bg-surface px-4 py-2 pb-[max(8px,env(safe-area-inset-bottom))] sm:-mx-4 sm:-mb-4 md:bottom-0 ${footerHidden ? "hidden" : ""}`}
        style={stageInset ? { bottom: stageInset } : undefined} data-testid="room-footer">
        {notSaved && (
          <div role="alert" className="mb-2 space-y-2 rounded-lg border border-warning bg-warning/10 px-3 py-2 text-[15px] text-ink sm:text-sm">
            <p>{narrow ? "Still not saved. Stay here or carry on — your answers are kept on this phone." : "Not saved yet — check your connection. Your answers are kept."}</p>
            {narrow && (
              <div className="flex gap-2">
                <button type="button" onClick={() => setNotSaved(null)} className="focus-ring min-h-[44px] flex-1 rounded-lg border border-hairline bg-surface px-4 text-sm font-bold text-ink">Stay</button>
                <button type="button" onClick={carryOn} className="focus-ring min-h-[44px] flex-1 rounded-lg border border-primary bg-surface px-4 text-sm font-bold text-primary">Carry on</button>
              </div>
            )}
          </div>
        )}
        <div className="flex min-h-[48px] items-center justify-between gap-3">
          {!narrow && (pos.prev ? (
            <button type="button" onClick={() => go(pos.prev.id)} disabled={moving} className={`${textBtn} max-w-[40%] truncate text-[15px]`} data-testid="room-prev">‹ {clean(pos.prev.name)}</button>
          ) : <span />)}
          <button type="button" onClick={() => go(last ? null : pos.next.id)} disabled={moving} data-testid="room-next"
            className={`focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 text-[15px] font-bold text-white hover:opacity-90 disabled:opacity-70 ${narrow ? "min-h-[52px] w-full" : "min-h-[48px] min-w-[160px]"}`}>
            {moving && <Spinner />}
            <span className="truncate">{moving ? "Saving…" : last ? "Done — back to Rooms" : `Next: ${clean(pos.next.name)} ›`}</span>
          </button>
        </div>
      </div>

      <Toast toast={toast} onClose={clear} />
    </div>
  );
}

/**
 * RoomsList — the Rooms tab (REGISTER_SCREENS_SPEC.md S2; owner approval 17 Nov 2026). Every room in walk order, grouped
 * by floor, with its one Work word, whether it has a brief and whether anything is open. The 16-row room table that used
 * to sit on the Project step lives only here now: add, rename, type, drawing sheet, reorder, floor and remove all happen
 * on this list (the row ⋯ menu), and tapping a row opens the room (S3).
 *
 *   Title row      "Rooms", "8 new · 8 renovated", "+ Add room" (opens the add panel on the first floor)
 *   Floor banner   upperFloorHint: "Choose upstairs rooms" (tick mode) · "Not now" (remembered for this job on this device)
 *   Filter         All · Brief needed n · Check work n (remembered per viewer)
 *   Floor blocks   sticky "GROUND FLOOR · 16"; "+ Add room here" only when the job has 2 or more floors; the inline add
 *                  panel (Work chosen once, nothing preselected the first time, then remembered for the session; each
 *                  chip adds a numbered room at the end of the floor); room rows
 *   Tick mode      "Tick the rooms that are upstairs" → "Move n rooms to Upper floor": one save, Undo for 10 s
 *
 * Every room-list write is one replaceItems call built from the current list (roomScreen.js), so taps never overwrite
 * each other. Records are never copied: Duplicate copies type, floor and Work only.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ROOM_SCOPES, ROOM_WORK_WORDS } from "../../../../lib/register.js";
import { clean, openPoints } from "../../../../lib/briefModel.js";
import { upperFloorHint } from "../../../../lib/registerQuality.js";
import {
  floorBlocks, floorsOf, floorKey, normaliseFloor, listCounts, workSummary, roomListRow, addRoomMeta, duplicateRoomMeta, moveRoomStep, dropRoomBefore,
  moveRoomToFloor, tickMoveMeta, restoreLevels, setRoomScope, removeRoomPlan, removeRoomText, addedText, duplicatedText, movedText, tickMoveLabel,
  tickCount, actionsPillText, storeysNote, addFloorOptions, workLabel, ADD_ROOM_CHIPS,
} from "../../../../lib/roomScreen.js";
import { FloorChips } from "./RoomBriefCard.jsx";
import { RoomDetails, WorkMenuItems, WorkPill } from "./RoomEdit.jsx";
import { FlagIcon } from "./NeedsAction.jsx";
import { Confirm, IconButton, MenuDivider, MenuItem, PlusIcon, Popover, Segmented, Toast } from "./RoomUi.jsx";
import { storeGet, storeSet, useNarrow, useStageBarInset, useToast } from "./useRoomUi.js";

const UPPER = "Upper";
const FILTERS = ["all", "brief", "check"];
const primaryBtn = "focus-ring inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";
const outlineBtn = "focus-ring inline-flex min-h-[44px] items-center justify-center rounded-lg border border-primary bg-surface px-4 text-sm font-bold text-primary hover:bg-primary/5";
const textBtn = "focus-ring inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-bold text-ink hover:bg-page";
const linkBtn = "focus-ring inline-flex min-h-[44px] items-center rounded-lg px-2 text-sm font-bold text-primary hover:underline";
const addChip = "focus-ring inline-flex min-h-[44px] items-center rounded-full border px-3.5 text-[15px] sm:min-h-[40px] sm:text-sm";
const TAG = "inline-flex h-5 shrink-0 items-center rounded-full border border-warning px-2 text-xs font-bold text-amber-800";

export default function RoomsList({ reg, context, mutateMeta, replaceItems, openRoom, readOnly, startTickMode }) {
  const narrow = useNarrow();
  const { leadId } = useParams();
  const jobKey = leadId || "job";
  const rooms = useMemo(() => reg.meta.rooms || [], [reg.meta.rooms]);
  const { toast, show, clear } = useToast();
  const stageInset = useStageBarInset();

  const [filter, setFilterState] = useState(() => { const v = storeGet(`register.rooms.filter.${jobKey}`, "all"); return FILTERS.includes(v) ? v : "all"; });
  const setFilter = (v) => { setFilterState(v); storeSet(`register.rooms.filter.${jobKey}`, v); };
  const [notNow, setNotNowState] = useState(() => storeGet(`register.rooms.notNow.${jobKey}`) === "1");
  const [work, setWorkState] = useState(() => { const v = storeGet("register.rooms.addWork", null, true); return ROOM_WORK_WORDS.includes(v) ? v : null; });
  const setWork = (v) => { setWorkState(v); storeSet("register.rooms.addWork", v, true); };

  const [tick, setTick] = useState(!!startTickMode && !readOnly);
  const [seenStart, setSeenStart] = useState(!!startTickMode);
  if (!!startTickMode !== seenStart) { setSeenStart(!!startTickMode); if (startTickMode && !readOnly) setTick(true); }
  const [ticked, setTicked] = useState([]);
  const [discarding, setDiscarding] = useState(false);
  const [adding, setAdding] = useState(null);           // the floor key whose add panel is open
  const [extraFloors, setExtraFloors] = useState([]);   // floors added here, still without rooms
  const [floorPanel, setFloorPanel] = useState(false);  // "+ Add a floor"
  const [floorName, setFloorName] = useState("");
  const dragId = useRef(null);
  // Inside the Documents edit drawer the list scrolls in the drawer: no app header above it and no bottom nav below it.
  const rootRef = useRef(null);
  const [inDialog, setInDialog] = useState(false);
  useEffect(() => { try { setInDialog(!!rootRef.current?.closest('[role="dialog"]')); } catch { /* old browser */ } }, []);

  // One write path for the room list: a function of the CURRENT list (the store's), so quick taps never clobber each other.
  const editRooms = (fn) => (replaceItems
    ? replaceItems((cur) => ({ ...cur, meta: { ...cur.meta, rooms: fn(cur.meta.rooms || []) } }))
    : mutateMeta({ rooms: fn(rooms) }));
  const removeRoom = (id) => (replaceItems ? replaceItems(removeRoomPlan(id)) : mutateMeta({ rooms: rooms.filter((r) => r.id !== id) }));

  const points = useMemo(() => openPoints(reg, context, { scope: "all" }), [reg, context]);
  const rows = useMemo(() => new Map(rooms.map((r) => [r.id, roomListRow(reg, context, r, points)])), [reg, context, rooms, points]);
  const counts = useMemo(() => listCounts(reg), [reg]);
  const hint = useMemo(() => upperFloorHint(reg), [reg]);
  const allFloors = floorsOf(rooms, extraFloors);
  const blocks = floorBlocks(reg, tick ? "all" : filter, extraFloors);
  const multiFloor = allFloors.length >= 2;
  const nTick = tickCount(rooms, ticked, UPPER);

  function openAdd(key) { setFilter("all"); setAdding(key); }
  function addRoom(floor, name, roomType) {
    if (!work || readOnly) return;
    let added = null;
    editRooms((list) => { const r = addRoomMeta(list, { name, roomType, level: floor.level, scope: work }); added = r.room; return r.rooms; });
    setExtraFloors((e) => e.filter((l) => floorKey(l) !== floor.key));
    if (added) { const id = added.id; show(addedText(added), () => removeRoom(id)); }
  }
  function duplicate(room) {
    let made = null, source = null;
    editRooms((list) => { const r = duplicateRoomMeta(list, room.id); made = r.room; source = r.source; return r.rooms; });
    if (made) { const id = made.id; show(duplicatedText(made, source), () => removeRoom(id)); }
  }
  function exitTick() { setTick(false); setTicked([]); setDiscarding(false); }
  function cancelTick() { if (ticked.length && nTick) setDiscarding(true); else exitTick(); }
  function moveTicked() {
    let res = null;
    editRooms((list) => { res = tickMoveMeta(list, ticked, UPPER); return res.rooms; });
    exitTick();
    if (res?.moved) { const previous = res.previous; show(movedText(res.moved, UPPER), () => editRooms((list) => restoreLevels(list, previous)), 10000); }
  }
  function addFloor(level) {
    const l = normaliseFloor(level);
    if (!clean(level)) return;
    if (!allFloors.some((f) => f.key === floorKey(l))) setExtraFloors((e) => [...e, l]);
    setFloorPanel(false); setFloorName("");
    openAdd(floorKey(l));
  }
  const dropOn = (beforeId, level) => {
    const id = dragId.current;
    dragId.current = null;
    if (!id || readOnly) return;
    editRooms((list) => (beforeId ? dropRoomBefore(list, id, beforeId) : moveRoomToFloor(list, id, level)));
  };

  const empty = !rooms.length && !extraFloors.length;
  const floorOptions = addFloorOptions(rooms).filter((l) => !extraFloors.some((e) => floorKey(e) === floorKey(l)));
  const shownCount = blocks.reduce((n, f) => n + f.rooms.length, 0);
  const note = storeysNote(rooms, context?.storeys);

  return (
    <div ref={rootRef} className="space-y-3 rounded-card bg-page p-3 sm:p-4" data-testid="rooms-list">
      {/* R1 Title row */}
      <div className="flex min-h-[56px] items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-6 text-ink">{tick ? "Tick the rooms that are upstairs" : "Rooms"}</h2>
          {!tick && rooms.length > 0 && <p className="text-[13px] text-muted" data-testid="rooms-summary">{rooms.length} room{rooms.length === 1 ? "" : "s"} · {workSummary(rooms)}</p>}
          {tick && <p className="text-[13px] text-muted">Which rooms are upstairs isn&apos;t on file, so nothing is ticked for you.</p>}
          {!tick && note && <p className="text-[13px] text-muted">{note}</p>}
        </div>
        {!tick && !readOnly && !empty && (narrow ? (
          <button type="button" onClick={() => openAdd(allFloors[0]?.key || "ground")} aria-label="Add room" className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white" data-testid="add-room"><PlusIcon /></button>
        ) : (
          <button type="button" onClick={() => openAdd(allFloors[0]?.key || "ground")} aria-expanded={!!adding} className={primaryBtn} data-testid="add-room"><PlusIcon />Add room</button>
        ))}
      </div>

      {/* R2 Floor banner */}
      {!tick && !readOnly && hint && !notNow && (
        <div role="note" className="space-y-2.5 rounded-card border border-warning bg-warning/10 p-3" data-testid="floor-banner">
          <p className="text-[15px] leading-5 text-ink sm:text-sm"><strong className="font-bold">Is anything upstairs?</strong> {hint.text}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => { setTick(true); setTicked([]); }} className={outlineBtn} data-testid="choose-upstairs">Choose upstairs rooms</button>
            <button type="button" onClick={() => { setNotNowState(true); storeSet(`register.rooms.notNow.${jobKey}`, "1"); }} className={textBtn}>Not now</button>
          </div>
        </div>
      )}

      {/* R3 Filter */}
      {!tick && rooms.length > 0 && (
        <Segmented full label="Show rooms" value={filter} onChange={setFilter} testId="rooms-filter"
          options={[
            ["all", <span key="a">All <span className="font-normal">{counts.all}</span></span>],
            ["brief", <span key="b">Brief needed <span className="font-normal">{counts.brief}</span></span>],
            ["check", <span key="c">Check work <span className="font-normal">{counts.check}</span></span>],
          ]} />
      )}

      {empty ? (
        <div className="space-y-3 rounded-card border border-hairline bg-surface p-4" data-testid="rooms-empty">
          <p className="text-[15px] leading-6 text-ink sm:text-sm">Add the rooms off the drawings, in the order you&apos;d walk through. You can rename, move and reorder any time without losing anything.</p>
          {!readOnly && <button type="button" onClick={() => { setExtraFloors(["Ground"]); openAdd("ground"); }} className={primaryBtn} data-testid="add-room"><PlusIcon />Add room</button>}
        </div>
      ) : (
        <>
          {filter !== "all" && !tick && !shownCount && (
            <div className="flex flex-wrap items-center gap-2 rounded-card border border-hairline bg-surface px-4 py-3 text-sm text-ink">
              <span>{filter === "brief" ? "Every room with work has a brief." : "No earlier answers disagree with a room's work."}</span>
              <button type="button" onClick={() => setFilter("all")} className={linkBtn}>Show all rooms</button>
            </div>
          )}
          {blocks.map((f) => (
            <section key={f.key} aria-labelledby={`floor-${f.key}`} data-testid={`floor-${f.key}`}>
              <div className={`sticky z-10 flex h-10 items-center justify-between gap-2 bg-page ${inDialog ? "top-0" : "top-[65px] md:top-0"}`}
                onDragOver={(e) => { if (dragId.current) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); dropOn(null, f.level); }}>
                <h3 id={`floor-${f.key}`} className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">{f.label} · {f.rooms.length}</h3>
                {multiFloor && !tick && !readOnly && adding !== f.key && <button type="button" onClick={() => openAdd(f.key)} className={linkBtn}>+ Add room here</button>}
              </div>
              {adding === f.key && !tick && !readOnly && (
                <AddPanel floor={f} work={work} setWork={setWork} narrow={narrow} onAdd={(name, type) => addRoom(f, name, type)} onDone={() => setAdding(null)} />
              )}
              {f.rooms.length > 0 ? (
                <ul className="rounded-card border border-hairline bg-surface">
                  {f.rooms.map((r, i) => (
                    <RoomRow key={r.id} reg={reg} room={r} row={rows.get(r.id)} first={i === 0} narrow={narrow} readOnly={readOnly} tick={tick}
                      ticked={ticked.includes(r.id)} onTick={() => setTicked((t) => (t.includes(r.id) ? t.filter((x) => x !== r.id) : [...t, r.id]))}
                      canUp={f.total > 1 && f.rooms[0]?.id !== r.id} canDown={f.total > 1 && f.rooms.at(-1)?.id !== r.id}
                      onOpen={() => openRoom?.(r.id)} editRooms={editRooms} mutateMeta={mutateMeta} onRemove={() => removeRoom(r.id)} onDuplicate={() => duplicate(r)}
                      onDragStart={() => { dragId.current = r.id; }} onDrop={() => dropOn(r.id)} />
                  ))}
                </ul>
              ) : adding !== f.key && (
                <p className="rounded-card border border-dashed border-hairline bg-surface px-4 py-3 text-sm text-muted">No rooms on this floor yet.</p>
              )}
            </section>
          ))}

          {/* R5 + Add a floor */}
          {!tick && !readOnly && (
            <div className="relative">
              {!floorPanel ? (
                <button type="button" onClick={() => setFloorPanel(true)} className={linkBtn} data-testid="add-floor">+ Add a floor</button>
              ) : (
                <div className="space-y-2 rounded-card border border-hairline bg-surface p-3">
                  <p className="text-sm font-bold text-ink">Add a floor</p>
                  <div className="flex flex-wrap gap-2">
                    {floorOptions.map((l) => <button key={l} type="button" onClick={() => addFloor(l)} className={`${addChip} border-hairline bg-surface text-ink hover:bg-page`}>{l === UPPER ? "Upper floor" : l}</button>)}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input value={floorName} onChange={(e) => setFloorName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addFloor(floorName); if (e.key === "Escape") setFloorPanel(false); }}
                      placeholder="Other… a short name, e.g. Loft" aria-label="Floor name" className="inp min-h-[44px] flex-1 text-base sm:text-sm" />
                    <div className="flex gap-2">
                      <button type="button" disabled={!clean(floorName)} onClick={() => addFloor(floorName)} className={primaryBtn}>Add floor</button>
                      <button type="button" onClick={() => { setFloorPanel(false); setFloorName(""); }} className={textBtn}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Tick mode bar: sticky, above the Hub's bottom nav on a phone */}
      {tick && (
        <div className={`sticky z-20 -mx-3 flex min-h-[64px] flex-wrap items-center justify-between gap-2 border-t border-hairline bg-surface px-3 py-2 sm:-mx-4 sm:px-4 ${inDialog ? "bottom-0" : "bottom-[76px] md:bottom-0"}`}
          style={stageInset && !inDialog ? { bottom: stageInset } : undefined} data-testid="tick-bar">
          {discarding ? (
            <Confirm text={`Discard ${nTick} floor change${nTick === 1 ? "" : "s"}?`} confirmLabel="Discard" cancelLabel="Keep ticking" onConfirm={exitTick} onCancel={() => setDiscarding(false)} />
          ) : (
            <>
              <button type="button" onClick={cancelTick} className={textBtn}>Cancel</button>
              <button type="button" disabled={!nTick} onClick={moveTicked} className={primaryBtn} data-testid="tick-move">{tickMoveLabel(nTick, UPPER)}</button>
            </>
          )}
        </div>
      )}

      <Toast toast={toast} onClose={clear} />
    </div>
  );
}

/** The inline add panel: the Work word once, then one tap per room. "Other…" asks for a name. */
function AddPanel({ floor, work, setWork, onAdd, onDone, narrow }) {
  const [other, setOther] = useState(false);
  const [name, setName] = useState("");
  const addOther = () => { if (clean(name)) { onAdd(clean(name), "generic"); setName(""); setOther(false); } };
  const chip = (on) => `${addChip} ${on ? "border-hairline bg-surface text-ink hover:bg-page" : "cursor-not-allowed border-hairline bg-page text-muted"}`;
  const labelId = `add-as-${floor.key}`;
  return (
    <div role="region" aria-label={`Add rooms to ${floor.label}`} className="mb-2 space-y-2.5 rounded-card border border-hairline bg-surface p-3" data-testid="add-panel">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span id={labelId} className="text-sm font-bold text-ink">Add to {floor.label} as</span>
        {!narrow && <div className="w-[26rem] max-w-full"><Segmented full label={`Add to ${floor.label} as`} value={work} onChange={setWork} options={ROOM_WORK_WORDS.map((k) => [k, ROOM_SCOPES[k]])} testId="add-work" /></div>}
        <button type="button" onClick={onDone} className="focus-ring ml-auto min-h-[44px] rounded-lg border border-hairline px-4 text-sm font-bold text-ink hover:bg-page">Done</button>
      </div>
      {narrow && <Segmented full label={`Add to ${floor.label} as`} value={work} onChange={setWork} options={ROOM_WORK_WORDS.map((k) => [k, ROOM_SCOPES[k]])} testId="add-work" />}
      {!work && <p className="text-[13px] text-muted">Choose the work first: each room you tap is added with it.</p>}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Rooms to add">
        {ADD_ROOM_CHIPS.map(([n, t]) => <button key={n} type="button" disabled={!work} onClick={() => onAdd(n, t)} className={chip(!!work)} data-testid={`add-chip-${t}`}>{n}</button>)}
        <button type="button" disabled={!work} onClick={() => setOther(true)} className={chip(!!work)}>Other…</button>
      </div>
      {other && work && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addOther(); if (e.key === "Escape") setOther(false); }}
            placeholder="Room name, e.g. Rumpus" aria-label="Room name" enterKeyHint="done" className="inp min-h-[44px] flex-1 text-base sm:text-sm" />
          <div className="flex gap-2">
            <button type="button" disabled={!clean(name)} onClick={addOther} className={primaryBtn}>Add</button>
            <button type="button" onClick={() => { setOther(false); setName(""); }} className={textBtn}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** One room on the list: name, Work pill, action pill and ⋯; line 2 the brief preview or "Brief needed"; tags. */
function RoomRow({ reg, room, row, first, narrow, readOnly, tick, ticked, onTick, canUp, canDown, onOpen, editRooms, mutateMeta, onRemove, onDuplicate, onDragStart, onDrop }) {
  const [menu, setMenu] = useState(null);   // null | "work" | "menu" | "rename" | "floor" | "details" | "remove"
  const workBtn = useRef(null);
  const moreBtn = useRef(null);
  const close = () => setMenu(null);
  const name = clean(room.name) || "Room";
  const out = room.scope === "not_in_scope";
  const r = row || {};
  const tags = (
    <>
      {!tick && r.checkWork && <span className={TAG}>Check work</span>}
      {r.unfinished && <span className={`${TAG} max-w-[14rem] truncate`}>Unfinished: “{r.unfinished}”</span>}
    </>
  );
  const preview = r.text ? <span className="min-w-0 truncate text-ink">{r.text}</span>
    : r.needed ? (
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
        <span className="min-w-0 truncate"><span className="text-ink">Brief needed</span>{r.mustHaves && <span className="text-muted"> · {r.mustHaves}</span>}</span>
      </span>
    ) : <span className="min-w-0 truncate text-muted">{out ? "Not part of this job" : room.scope === "existing_remain" ? `No work planned${r.mustHaves ? ` · ${r.mustHaves}` : ""}` : r.mustHaves}</span>;

  const workPill = (
    <span className="pointer-events-auto relative">
      {readOnly ? <WorkPill scope={room.scope} chevron={false} /> : (
        <button ref={workBtn} type="button" aria-haspopup="menu" aria-expanded={menu === "work"} aria-label={`${workLabel(room.scope)}, change work for ${name}`}
          onClick={() => setMenu((m) => (m === "work" ? null : "work"))} className="focus-ring -my-2 flex h-11 items-center rounded-lg" data-testid={`work-pill-${room.id}`}>
          <WorkPill scope={room.scope} />
        </button>
      )}
      <Popover open={menu === "work"} onClose={close} narrow={narrow} anchorRef={workBtn} title={narrow ? `Work in ${name}` : undefined}>
        <WorkMenuItems room={room} onPick={(k) => { if (k !== room.scope) editRooms((list) => setRoomScope(list, room.id, k)); close(); }} />
      </Popover>
    </span>
  );
  const actionPill = !tick && r.actions > 0 && (
    <button type="button" onClick={onOpen} aria-label={`${actionsPillText(r.actions)} for ${name}`} className="pointer-events-auto focus-ring -my-2 flex h-11 items-center rounded-lg">
      <span className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full bg-warning/10 px-2.5 text-xs font-bold text-amber-800"><FlagIcon size={14} />{actionsPillText(r.actions)}</span>
    </button>
  );
  const more = !readOnly && (
    <span className="pointer-events-auto relative">
      <IconButton label={`More for ${name}`} buttonRef={moreBtn} expanded={!!menu && menu !== "work"} onClick={() => setMenu((m) => (m && m !== "work" ? null : "menu"))} className="-my-2 -mr-3" />
      <Popover open={!!menu && menu !== "work"} onClose={close} narrow={narrow} anchorRef={moreBtn} title={narrow ? name : undefined} wide={menu === "details"}>
        {menu === "menu" && (
          <div role="menu">
            <MenuItem onClick={() => setMenu("rename")}>Rename</MenuItem>
            <MenuItem onClick={() => { onDuplicate(); close(); }}>Duplicate</MenuItem>
            <MenuItem chevron onClick={() => setMenu("floor")}>Move to another floor</MenuItem>
            <MenuItem disabled={!canUp} onClick={() => { editRooms((list) => moveRoomStep(list, room.id, -1)); close(); }}>Move up</MenuItem>
            <MenuItem disabled={!canDown} onClick={() => { editRooms((list) => moveRoomStep(list, room.id, 1)); close(); }}>Move down</MenuItem>
            <MenuItem onClick={() => setMenu("details")}>Room type and drawing sheet…</MenuItem>
            <MenuDivider />
            <MenuItem danger onClick={() => setMenu("remove")}>Remove room…</MenuItem>
          </div>
        )}
        {menu === "rename" && <RoomDetails room={room} editRooms={editRooms} fields={["name"]} autoFocus onDone={close} />}
        {menu === "details" && <RoomDetails room={room} editRooms={editRooms} fields={["type", "sheet"]} onDone={close} />}
        {menu === "floor" && <div className="p-2"><FloorChips reg={reg} room={room} mutateMeta={mutateMeta} onDone={close} /></div>}
        {menu === "remove" && <Confirm text={removeRoomText(reg, room)} confirmLabel="Remove" onConfirm={() => { close(); onRemove(); }} onCancel={close} />}
      </Popover>
    </span>
  );

  return (
    <li className={`relative px-4 py-3 first:rounded-t-card last:rounded-b-card ${first ? "" : "border-t border-hairline"} ${narrow ? "min-h-[72px]" : "min-h-[64px]"}`} data-testid={`room-row-${room.id}`}
      draggable={!narrow && !tick && !readOnly} onDragStart={(e) => { try { e.dataTransfer.setData("text/plain", room.id); e.dataTransfer.effectAllowed = "move"; } catch { /* old browser */ } onDragStart(); }}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onDrop(); }}>
      {tick ? (
        <button type="button" role="checkbox" aria-checked={ticked} aria-label={name} onClick={onTick} className="focus-ring absolute inset-0 h-full w-full rounded-[inherit] hover:bg-page/60" data-testid={`tick-${room.id}`} />
      ) : (
        <button type="button" aria-label={`Open ${name}`} onClick={onOpen} className="focus-ring absolute inset-0 h-full w-full rounded-[inherit] hover:bg-page/60" data-testid={`open-room-${room.id}`} />
      )}
      <div className="pointer-events-none relative flex min-h-[28px] items-center gap-2">
        {tick && (
          <span aria-hidden="true" className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center">
            <span className={`flex h-6 w-6 items-center justify-center rounded-md border-2 ${ticked ? "border-primary bg-primary text-white" : "border-hairline bg-surface"}`}>
              {ticked && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>}
            </span>
          </span>
        )}
        <span className={`min-w-0 flex-1 truncate text-[15px] font-bold ${out ? "text-muted line-through" : "text-ink"}`}>{name}</span>
        {!tick && !narrow && workPill}
        {actionPill}
        {!tick && more}
      </div>
      {tick ? (r.unfinished ? <div className="pointer-events-none relative mt-1 flex pl-10">{tags}</div> : null) : narrow ? (
        <>
          <div className="pointer-events-none relative mt-1 flex flex-wrap items-center gap-2">{workPill}{tags}</div>
          <div className="pointer-events-none relative mt-1 flex text-[13px] leading-5">{preview}</div>
        </>
      ) : (
        <div className="pointer-events-none relative mt-1 flex min-w-0 items-center gap-2 text-[13px] leading-5">{preview}{tags}</div>
      )}
    </li>
  );
}

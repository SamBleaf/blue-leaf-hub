/**
 * RoomEdit — the room-level edits the Rooms list and the room screen share (REGISTER_SCREENS_SPEC.md S2, S3, S3p):
 *   RoomDetails     name, room type and drawing sheet (the row ⋯ "Room type and drawing sheet…", the room's "Room details")
 *   WorkMenuItems   New · Renovated · Altered · No change · divider · Not in this job (the list's Work pill popover)
 *   WorkPill        the Work word as a pill, styled per word
 *
 * Writes go through editRooms(fn), where fn takes the current room list and returns the next one, so two quick taps
 * never overwrite each other. Nothing here touches records.
 */
import { ROOM_SCOPES, ROOM_TYPES, ROOM_WORK_WORDS } from "../../../../lib/register.js";
import { patchRoom, renameRoomMeta, workLabel } from "../../../../lib/roomScreen.js";
import { DraftInput, MenuDivider, MenuItem, NameInput } from "./RoomUi.jsx";

const label13 = "text-[13px] font-bold text-ink";
const inputCls = "inp min-h-[44px] w-full text-base sm:text-sm";

/** Name, room type and drawing sheet. fields limits which show. Each saves as it changes. */
export function RoomDetails({ room, editRooms, readOnly, fields = ["name", "type", "sheet"], autoFocus = false, onDone }) {
  const id = room.id;
  return (
    <div className="space-y-3 p-2" data-testid="room-details">
      {fields.includes("name") && (
        <label className="block space-y-1.5"><span className={label13}>Room name</span>
          <NameInput value={room.name} disabled={readOnly} autoFocus={autoFocus} onDone={onDone} aria-label="Room name" className={inputCls}
            onCommit={(v) => editRooms((rooms) => renameRoomMeta(rooms, id, v))} />
        </label>
      )}
      {fields.includes("type") && (
        <label className="block space-y-1.5"><span className={label13}>Room type</span>
          <select value={room.roomType} disabled={readOnly} onChange={(e) => editRooms((rooms) => patchRoom(rooms, id, { roomType: e.target.value }))} className={inputCls} aria-label="Room type">
            {Object.entries(ROOM_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <span className="block text-xs text-muted">Sets which choices this room asks. Nothing already recorded is lost.</span>
        </label>
      )}
      {fields.includes("sheet") && (
        <label className="block space-y-1.5"><span className={label13}>Drawing sheet</span>
          <DraftInput value={room.sheet} disabled={readOnly} placeholder="e.g. A102 rev C" aria-label="Drawing sheet" className={inputCls}
            onCommit={(v) => editRooms((rooms) => patchRoom(rooms, id, { sheet: v }))} />
        </label>
      )}
      {onDone && <button type="button" onClick={onDone} className="focus-ring min-h-[44px] rounded-lg border border-hairline px-4 text-sm font-bold text-ink hover:bg-page">Done</button>}
    </div>
  );
}

/** The Work popover: a tap saves and closes. */
export function WorkMenuItems({ room, onPick }) {
  return (
    <div role="menu">
      {ROOM_WORK_WORDS.map((k) => <MenuItem key={k} checked={room.scope === k} onClick={() => onPick(k)}>{ROOM_SCOPES[k]}</MenuItem>)}
      <MenuDivider />
      <MenuItem checked={room.scope === "not_in_scope"} onClick={() => onPick("not_in_scope")}>{ROOM_SCOPES.not_in_scope}</MenuItem>
    </div>
  );
}

const PILL = {
  new: "bg-accent/10 text-accent",
  renovated: "bg-primary/[0.08] text-primary",
  altered: "border border-dashed border-primary text-primary",
  existing_remain: "bg-page text-muted",
  not_in_scope: "bg-hairline text-muted",
};

/** The Work word as a pill (28 px tall; the button around it gives the 44 px target). */
export function WorkPill({ scope, chevron = true }) {
  return (
    <span className={`inline-flex h-7 min-w-[88px] items-center justify-center gap-1 whitespace-nowrap rounded-full px-3 text-xs font-bold ${PILL[scope] || PILL.existing_remain}`}>
      {workLabel(scope)}
      {chevron && <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>}
    </span>
  );
}

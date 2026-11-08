/**
 * RoomsStep — the room-by-room walkthrough (Tab 18 §4, Tab 22 §I worked card). One room at a time, its
 * relevant prompts grouped by topic, project-wide defaults inherited until a room exception is recorded.
 * Rename / reorder never breaks links (items reference the stable room id).
 */
import { useEffect } from "react";
import {
  promptsFor, resolvePromptId, defaultItemFor, makeItem, ROOM_TYPES, ROOM_SCOPES, ROOM_TOPICS, ITEM_KINDS,
  partitionRoomPrompts, outstandingReasons, SETTLED_DISPOSITIONS,
} from "../../../../lib/register.js";
import { Section, Select } from "./ui.jsx";
import PromptRow from "./PromptRow.jsx";

const NO_ROOMS = [];

export default function RoomsStep({ reg, context, stage, showDetail, activeRoomId, setActiveRoomId, actor, upsertItem, updateItem, deleteItem, addItem, mutateMeta, onSaveNext, onPrev, gotoContext, onPortalItem, readOnly }) {
  const rooms = reg.meta.rooms || NO_ROOMS;
  const room = rooms.find((r) => r.id === activeRoomId) || rooms[0] || null;
  useEffect(() => { if (!activeRoomId && rooms[0]) setActiveRoomId(rooms[0].id); }, [activeRoomId, rooms, setActiveRoomId]);
  if (!room) {
    return <p className="text-sm text-muted">No rooms yet. <button type="button" onClick={gotoContext} className="font-semibold text-primary hover:underline">Add rooms from the plans</button> in the Project step.</p>;
  }
  const idx = rooms.findIndex((r) => r.id === room.id);
  const projectType = context?.projectType || "";
  const qs = promptsFor("room", { roomType: room.roomType, roomScope: room.scope, projectType, renovationOverlay: reg.meta.renovationOverlay, stage, showDetail });
  const primarySet = partitionRoomPrompts(qs);   // R04 Slice 5: which prompts lead the guided conversation
  const roomItems = reg.items.filter((i) => i.roomId === room.id);
  const itemFor = (qid) => roomItems.find((i) => resolvePromptId(i.promptKey) === qid && !i.overridesDefaultId) || null;
  const exceptionFor = (defaultId) => roomItems.find((i) => i.overridesDefaultId === defaultId) || null;
  const promptIds = new Set(qs.map((q) => q.id));
  const custom = roomItems.filter((i) => !i.promptKey || !promptIds.has(resolvePromptId(i.promptKey)));
  const levels = [...new Set(rooms.map((r) => r.level || "—"))];
  const setRoom = (partial) => mutateMeta({ rooms: rooms.map((r) => (r.id === room.id ? { ...r, ...partial } : r)) });
  const seedFor = (q) => ({ itemKind: q.itemKind, category: q.category, promptKey: q.id, roomId: room.id, level: room.level, room: room.name,
    technicalStatus: q.technical, responsibility: q.owner || "", source: room.sheet || "" });
  const renderRow = (q) => {
    const def = q.inherits ? defaultItemFor(reg, q.inherits) : null;
    const exc = def ? exceptionFor(def.id) : null;
    const item = exc || itemFor(q.id);
    return (
      <PromptRow key={q.id} question={q} item={item} seed={seedFor(q)} actor={actor} inherited={def && !item ? def : null}
        readOnlyReason={readOnly ? "Read-only" : null}
        onMakeException={() => def && addItem({ ...seedFor(q), itemKind: def.itemKind, description: def.description, product: def.product,
          manufacturer: def.manufacturer, model: def.model, colour: def.colour, supplier: def.supplier, certainty: def.certainty, overridesDefaultId: def.id })}
        onChange={(partial) => (item ? updateItem(item.id, partial) : upsertItem(seedFor(q), partial))}
        onDelete={item ? () => deleteItem(item.id) : null}
        onPortal={item ? (action, ev) => onPortalItem(item, action, ev) : null} />
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onPrev} disabled={idx <= 0} className="rounded border border-hairline px-2 py-1 text-xs text-ink hover:bg-page disabled:opacity-30">←</button>
        <select value={room.id} onChange={(e) => setActiveRoomId(e.target.value)} className="inp max-w-[18rem] text-xs" data-testid="room-picker">
          {levels.map((lv) => (
            <optgroup key={lv} label={lv}>
              {rooms.filter((r) => (r.level || "—") === lv).map((r) => (
                <option key={r.id} value={r.id}>{r.name} — {ROOM_SCOPES[r.scope] || r.scope} ({reg.items.filter((x) => x.roomId === r.id).length})</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button type="button" onClick={onSaveNext} disabled={idx >= rooms.length - 1} className="rounded border border-hairline px-2 py-1 text-xs text-ink hover:bg-page disabled:opacity-30">→</button>
        <span className="text-[11px] text-muted">Room {idx + 1} of {rooms.length}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-hairline bg-page px-2.5 py-2">
        <input value={room.name} disabled={readOnly} onChange={(e) => setRoom({ name: e.target.value })} className="inp w-40 text-xs font-semibold" aria-label="Room name" />
        <input value={room.level} disabled={readOnly} onChange={(e) => setRoom({ level: e.target.value })} className="inp w-20 text-[11px]" aria-label="Level" />
        <Select value={room.roomType} onChange={(v) => setRoom({ roomType: v })} options={Object.entries(ROOM_TYPES)} className="w-36" disabled={readOnly} />
        <Select value={room.scope} onChange={(v) => setRoom({ scope: v })} options={Object.entries(ROOM_SCOPES)} className="w-32" disabled={readOnly} />
        <input value={room.sheet} disabled={readOnly} onChange={(e) => setRoom({ sheet: e.target.value })} placeholder="Drawing sheet / rev" className="inp w-32 text-[11px]" aria-label="Drawing reference" />
        <span className="ml-auto text-[11px] text-muted">{roomItems.length} recorded</span>
      </div>

      {room.scope === "not_in_scope" ? (
        <p className="rounded border border-hairline bg-surface p-3 text-xs text-muted">This room is marked <b>not in scope</b>. Change the room scope above to record work here, or add a custom note below.</p>
      ) : ROOM_TOPICS.map((t) => {
        const list = qs.filter((q) => q.topic === t.key);
        if (!list.length) return null;
        const prim = list.filter((q) => primarySet.has(q.id));
        const more = list.filter((q) => !primarySet.has(q.id));
        const started = list.filter((q) => itemFor(q.id) || (q.inherits && exceptionFor(defaultItemFor(reg, q.inherits)?.id))).length;
        return (
          <Section key={t.key} title={t.label} count={started ? `${started}/${list.length}` : null} defaultOpen={prim.length > 0}>
            {prim.map(renderRow)}
            {more.length > 0 && (prim.length > 0
              ? <Section title="Explore more" count={more.length} defaultOpen={false}>{more.map(renderRow)}</Section>
              : more.map(renderRow))}
          </Section>
        );
      })}

      {room.scope !== "not_in_scope" && roomItems.length > 0 && (() => {
        // Derived end-of-room summary (no new data): what's agreed, what's still to confirm, and who owns the next move.
        const agreed = roomItems.filter((i) => i.certainty === "client_approved" || SETTLED_DISPOSITIONS.has(i.disposition)).length;
        const unresolved = roomItems.filter((i) => outstandingReasons(i).length > 0);
        const owners = roomItems.filter((i) => i.responsibility && i.nextAction);
        return (
          <Section title="This room at a glance" count={`${agreed} agreed · ${unresolved.length} to confirm`} defaultOpen={false}>
            {unresolved.length ? (
              <div><p className="mb-0.5 text-[11px] font-semibold text-amber-800">Still to confirm</p>
                <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-ink">{unresolved.slice(0, 8).map((i) => <li key={i.id}>{i.description || i.category}{i.responsibility ? ` — ${i.responsibility}` : ""}</li>)}</ul></div>
            ) : <p className="text-[11px] text-muted">Nothing outstanding recorded in this room.</p>}
            {owners.length ? (
              <div className="mt-1.5"><p className="mb-0.5 text-[11px] font-semibold text-muted">Next action / owner</p>
                <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-ink">{owners.slice(0, 8).map((i) => <li key={i.id}>{i.nextAction} — {i.responsibility}</li>)}</ul></div>
            ) : null}
          </Section>
        );
      })()}

      {custom.length > 0 && (
        <Section title="Other items in this room" count={custom.length} defaultOpen>
          {custom.map((item) => (
            <PromptRow key={item.id} question={null} item={item} actor={actor} readOnlyReason={readOnly ? "Read-only" : null}
              onChange={(partial) => updateItem(item.id, partial)} onDelete={() => deleteItem(item.id)}
              onPortal={(action, ev) => onPortalItem(item, action, ev)} />
          ))}
        </Section>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted">Add custom:</span>
          {Object.entries(ITEM_KINDS).map(([k, l]) => (
            <button key={k} type="button" onClick={() => addItem(makeItem({ itemKind: k, category: k === "scope" ? "scope" : "notes", roomId: room.id, level: room.level, room: room.name, source: room.sheet || "" }))}
              className="rounded-full border border-dashed border-hairline px-2 py-0.5 text-[11px] text-primary hover:bg-page">+ {l}</button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-hairline pt-3">
        <button type="button" onClick={onPrev} disabled={idx <= 0} className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-page disabled:opacity-30">← Previous room</button>
        <button type="button" onClick={onSaveNext} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90" data-testid="save-next-room">
          {idx >= rooms.length - 1 ? "Save — last room" : "Save & next room →"}
        </button>
      </div>
    </div>
  );
}

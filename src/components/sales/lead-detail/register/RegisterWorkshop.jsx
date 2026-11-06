/**
 * RegisterWorkshop — the staff-operated room-by-room brief (Tab 18 / R02 Increment 1).
 *
 * Lives INSIDE the existing lead stages (Concept / Consultants / Tender) — no new page, stage or
 * department. Reads + writes the pre-job scratchpad `leads.selections_schedule` via the lead's own
 * optimistic `patch()` (no migration). Guided flow: Setup → Whole House → Rooms → Outstanding → Documents.
 *
 * Simplicity first (fewest taps, advanced detail behind "More"); the salesperson is the client
 * interface — this screen is the staff tool, not a client-facing showroom.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  readRegister, writeRegister, emptyMeta, makeItem, makeRoom, roomPrompts, WHOLE_HOUSE_PROMPTS,
  applyDefaultToRooms, outstandingItems, resumePointer, buildDocViews, isClientSelection, roomLabel,
  REGISTER_DISPOSITIONS, DISPOSITION_ORDER, REGISTER_CERTAINTY, CERTAINTY_ORDER, REGISTER_CATEGORIES,
  ROOM_TYPES, ROOM_SCOPES, RESPONSIBILITIES, dispositionLabel, certaintyLabel, categoryLabel,
} from "../../../../lib/register.js";
import { PROJECT_TYPES } from "../../../../lib/salesPipeline.js";

const STEPS = [
  { key: "setup", label: "Plan setup" },
  { key: "whole_house", label: "Whole house" },
  { key: "rooms", label: "Rooms" },
  { key: "outstanding", label: "Outstanding" },
  { key: "documents", label: "Documents" },
];

// Project type is the canonical lead fact (leads.project_type) — read/written through, never forked.
const projectTypeLabel = (v) => PROJECT_TYPES.find((p) => p.value === v)?.label || v || "";
const DELIVERY_OPTS = [
  { v: "design_build", l: "Design & build" }, { v: "cm", l: "Construction management" }, { v: "other", l: "Other" },
];

export default function RegisterWorkshop({ lead, patch, stage }) {
  // Register state is owned here while mounted; initialised once from the lead scratchpad.
  const [reg, setReg] = useState(() => readRegister(lead));
  const [step, setStep] = useState(() => resumePointer(readRegister(lead)).step);
  const [activeRoomId, setActiveRoomId] = useState(() => resumePointer(readRegister(lead)).roomId);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [docView, setDocView] = useState(null); // { which, data }
  const savingRef = useRef(false);
  const pendingRef = useRef(false);  // a save was requested while one was in flight
  const editSeqRef = useRef(0);      // bumped on every edit, so we never clear dirty against a stale save
  const regRef = useRef(reg);        // always-current register for the trailing flush
  useEffect(() => { regRef.current = reg; }, [reg]);

  // ── persistence ──────────────────────────────────────────────────────────────
  // Guards against two data-loss races: (1) an edit made DURING an in-flight save must not be marked
  // "Saved" (dirty is only cleared if no edit landed since the save started); (2) a save requested
  // while one is in flight is queued and flushed with the LATEST register, never silently dropped.
  async function persist(next) {
    if (savingRef.current) { pendingRef.current = true; return; }
    savingRef.current = true;
    const seqAtStart = editSeqRef.current;
    const saved = await patch({ selections_schedule: writeRegister(next) });
    savingRef.current = false;
    if (saved && editSeqRef.current === seqAtStart) { setDirty(false); setSavedAt(new Date()); }
    if (pendingRef.current || editSeqRef.current !== seqAtStart) { pendingRef.current = false; persist(regRef.current); }
  }
  // Mutate register + mark dirty (local only until Save).
  function mutate(fn) { editSeqRef.current += 1; setReg((cur) => fn(cur)); setDirty(true); }
  function save() { persist(reg); }
  function gotoStep(s) { const r = { ...reg, meta: emptyMeta({ ...reg.meta, lastStep: s }) }; setReg(r); setStep(s); if (dirty) persist(r); }

  function mutateMeta(partial) {
    editSeqRef.current += 1;
    setReg((cur) => ({ ...cur, meta: emptyMeta({ ...cur.meta, ...partial }) }));
    setDirty(true);
  }

  // ── room helpers ───────────────────────────────────────────────────────────────
  const rooms = reg.meta.rooms || [];
  const activeRoom = rooms.find((r) => r.id === activeRoomId) || null;

  function addRoom() {
    const r = makeRoom({ order: rooms.length });
    mutate((cur) => ({ ...cur, meta: emptyMeta({ ...cur.meta, rooms: [...cur.meta.rooms, r] }) }));
    setActiveRoomId(r.id);
  }
  function updateRoom(id, partial) {
    mutate((cur) => ({ ...cur, meta: emptyMeta({ ...cur.meta, rooms: cur.meta.rooms.map((r) => (r.id === id ? makeRoom({ ...r, ...partial }) : r)) }) }));
  }
  function deleteRoom(id) {
    mutate((cur) => ({ ...cur, meta: emptyMeta({ ...cur.meta, rooms: cur.meta.rooms.filter((r) => r.id !== id) }), items: cur.items.filter((i) => i.roomId !== id) }));
    if (activeRoomId === id) setActiveRoomId(null);
  }
  function moveRoom(id, dir) {
    const idx = rooms.findIndex((r) => r.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= rooms.length) return;
    const next = rooms.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    mutate((cur) => ({ ...cur, meta: emptyMeta({ ...cur.meta, rooms: next.map((r, i) => makeRoom({ ...r, order: i })) }) }));
  }

  // ── item helpers ─────────────────────────────────────────────────────────────
  function itemFor(roomId, promptKey) {
    return reg.items.find((i) => i.roomId === roomId && i.promptKey === promptKey && !i.overridesDefaultId) || null;
  }
  function upsertItem(seed, partial) {
    mutate((cur) => {
      const existing = cur.items.find((i) => i.id === seed.id);
      if (existing) return { ...cur, items: cur.items.map((i) => (i.id === seed.id ? makeItem({ ...i, ...partial }) : i)) };
      return { ...cur, items: [...cur.items, makeItem({ ...seed, ...partial })] };
    });
  }
  function updateItem(id, partial) {
    mutate((cur) => ({ ...cur, items: cur.items.map((i) => (i.id === id ? makeItem({ ...i, ...partial }) : i)) }));
  }
  function deleteItem(id) { mutate((cur) => ({ ...cur, items: cur.items.filter((i) => i.id !== id) })); }

  const outstanding = useMemo(() => outstandingItems(reg), [reg]);

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-card border border-hairline bg-surface">
      {/* Narrow meeting header (Tab 18 §3) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Project brief &amp; register</p>
          <p className="truncate text-[11px] text-muted">
            {lead.project_type ? projectTypeLabel(lead.project_type) : "Project type —"}
            {reg.meta.planRev ? ` · Drawings ${reg.meta.planRev}` : " · Drawings —"}
            {` · ${rooms.length} room${rooms.length === 1 ? "" : "s"}`}
            {outstanding.length ? ` · ${outstanding.length} outstanding` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && !dirty && <span className="text-[11px] text-green-600">Saved {savedAt.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}</span>}
          {dirty && <span className="text-[11px] text-amber-600">Unsaved</span>}
          <button type="button" onClick={save} disabled={!dirty} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">Save</button>
        </div>
      </div>

      {/* Step strip */}
      <div className="flex flex-wrap gap-1 border-b border-hairline px-3 py-2">
        {STEPS.map((s) => (
          <button key={s.key} type="button" onClick={() => gotoStep(s.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${step === s.key ? "bg-primary text-white" : "border border-hairline text-ink hover:bg-page"}`}>
            {s.label}{s.key === "outstanding" && outstanding.length ? ` (${outstanding.length})` : ""}
          </button>
        ))}
      </div>

      <div className="p-4">
        {step === "setup" && (
          <SetupStep meta={reg.meta} mutateMeta={mutateMeta} lead={lead} patchLead={patch} rooms={rooms} addRoom={addRoom} updateRoom={updateRoom} deleteRoom={deleteRoom} moveRoom={moveRoom}
            openRoom={(id) => { const r = { ...reg, meta: emptyMeta({ ...reg.meta, lastRoomId: id, lastStep: "rooms" }) }; setReg(r); persist(r); setActiveRoomId(id); setStep("rooms"); }} />
        )}
        {step === "whole_house" && (
          <WholeHouseStep reg={reg} upsertItem={upsertItem} updateItem={updateItem} applyDefault={(defId, roomIds) => { mutate((cur) => applyDefaultToRooms(cur, defId, roomIds)); }} rooms={rooms} />
        )}
        {step === "rooms" && (
          <RoomsStep reg={reg} rooms={rooms} activeRoom={activeRoom} setActiveRoomId={setActiveRoomId}
            itemFor={itemFor} upsertItem={upsertItem} updateItem={updateItem} deleteItem={deleteItem}
            addRoom={addRoom} onSaveNext={() => {
              const idx = rooms.findIndex((r) => r.id === activeRoomId);
              const next = rooms[idx + 1];
              const nextRoomId = next ? next.id : activeRoomId;
              const r = { ...reg, meta: emptyMeta({ ...reg.meta, lastRoomId: nextRoomId, lastStep: "rooms" }) };
              setReg(r); persist(r);
              if (next) setActiveRoomId(next.id);
            }}
            onPrev={() => { const idx = rooms.findIndex((r) => r.id === activeRoomId); const p = rooms[idx - 1]; if (p) setActiveRoomId(p.id); }}
            markLastRoom={(id) => mutateMeta({ lastRoomId: id, lastStep: "rooms" })} />
        )}
        {step === "outstanding" && (
          <OutstandingStep reg={reg} rooms={rooms} updateItem={updateItem} deleteItem={deleteItem} />
        )}
        {step === "documents" && (
          <DocumentsStep lead={lead} reg={reg} stage={stage} onPreview={(which) => setDocView({ which, data: buildDocViews(lead, reg) })} />
        )}
      </div>

      {docView && <DocPreviewModal which={docView.which} data={docView.data} onClose={() => setDocView(null)} />}
    </div>
  );
}

// ── Step: Plan setup ───────────────────────────────────────────────────────────
function SetupStep({ meta, mutateMeta, lead, patchLead, rooms, addRoom, updateRoom, deleteRoom, moveRoom, openRoom }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Current drawing set / revision">
          <input value={meta.planRev} onChange={(e) => mutateMeta({ planRev: e.target.value })} placeholder="e.g. DA Rev C" className="inp" />
        </Field>
        <Field label="Project type">
          {/* Canonical lead fact — written straight through to leads.project_type, never forked into the register. */}
          <select value={lead.project_type || ""} onChange={(e) => patchLead({ project_type: e.target.value || null })} className="inp">
            <option value="">—</option>
            {PROJECT_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Delivery model">
          <select value={meta.deliveryModel} onChange={(e) => mutateMeta({ deliveryModel: e.target.value })} className="inp">
            <option value="">—</option>
            {DELIVERY_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </Field>
        <Field label="Occupancy">
          <input value={meta.occupancy} onChange={(e) => mutateMeta({ occupancy: e.target.value })} placeholder="e.g. occupied during works" className="inp" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" className="h-4 w-4 accent-primary" checked={!!meta.renovationOverlay} onChange={(e) => mutateMeta({ renovationOverlay: e.target.checked })} />
        Renovation overlay (adds demolish / retain / make-good prompts to rooms)
      </label>

      <div className="rounded-lg border border-hairline bg-page p-3">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="section-label">Rooms &amp; levels (from the plans)</h4>
          <button type="button" onClick={addRoom} className="text-xs font-semibold text-primary hover:underline">+ Add room</button>
        </div>
        {rooms.length === 0 ? (
          <p className="text-xs text-muted">Add the rooms off the drawings in a natural walk order. You can reorder any time.</p>
        ) : (
          <div className="space-y-1.5">
            {rooms.map((r, i) => (
              <div key={r.id} className="flex flex-wrap items-center gap-1.5">
                <div className="flex flex-col">
                  <button type="button" onClick={() => moveRoom(r.id, -1)} disabled={i === 0} className="text-[10px] leading-none text-muted hover:text-ink disabled:opacity-30">▲</button>
                  <button type="button" onClick={() => moveRoom(r.id, 1)} disabled={i === rooms.length - 1} className="text-[10px] leading-none text-muted hover:text-ink disabled:opacity-30">▼</button>
                </div>
                <input value={r.level} onChange={(e) => updateRoom(r.id, { level: e.target.value })} placeholder="Level" className="inp w-24" />
                <input value={r.name} onChange={(e) => updateRoom(r.id, { name: e.target.value })} placeholder="Room name" className="inp flex-1 min-w-[8rem]" />
                <select value={r.roomType} onChange={(e) => updateRoom(r.id, { roomType: e.target.value })} className="inp w-36">
                  {Object.entries(ROOM_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <select value={r.scope} onChange={(e) => updateRoom(r.id, { scope: e.target.value })} className="inp w-36">
                  {Object.entries(ROOM_SCOPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <button type="button" onClick={() => openRoom(r.id)} className="rounded border border-hairline px-2 py-1 text-[11px] text-primary hover:bg-surface">Open</button>
                <button type="button" onClick={() => deleteRoom(r.id)} className="px-1.5 text-xs text-red-500 hover:text-red-700">×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step: Whole house (defaults) ─────────────────────────────────────────────────
function WholeHouseStep({ reg, upsertItem, updateItem, applyDefault, rooms }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Set the project-wide standards once. Use “Apply to rooms” to copy a default into specific rooms as a visible, editable record (rooms you don’t pick are never touched).</p>
      {WHOLE_HOUSE_PROMPTS.map((p) => {
        const item = reg.items.find((i) => i.isDefault && i.promptKey === p.key && !i.roomId) || null;
        return (
          <PromptRow key={p.key} prompt={p} item={item} rooms={rooms} isDefault
            onChange={(partial) => {
              if (item) updateItem(item.id, partial);
              else upsertItem(makeItem({ itemKind: p.itemKind, category: p.category, promptKey: p.key, isDefault: true, room: "Whole house" }), partial);
            }}
            onApply={(roomIds) => item && applyDefault(item.id, roomIds)} />
        );
      })}
    </div>
  );
}

// ── Step: Rooms ──────────────────────────────────────────────────────────────────
function RoomsStep({ reg, rooms, activeRoom, setActiveRoomId, itemFor, upsertItem, updateItem, deleteItem, addRoom, onSaveNext, onPrev, markLastRoom }) {
  // Default the active room to the first one without mutating state during render.
  useEffect(() => { if (!activeRoom && rooms[0]) setActiveRoomId(rooms[0].id); }, [activeRoom, rooms, setActiveRoomId]);
  if (rooms.length === 0) {
    return <div className="text-sm text-muted">No rooms yet. <button type="button" onClick={addRoom} className="font-semibold text-primary hover:underline">Add your first room</button> or add them in Plan setup.</div>;
  }
  const room = activeRoom || rooms[0];
  const prompts = roomPrompts(room.roomType, { renovationOverlay: !!reg.meta.renovationOverlay, roomScope: room.scope });
  const customItems = reg.items.filter((i) => i.roomId === room.id && !i.promptKey);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted">Room</label>
        <select value={room.id} onChange={(e) => { setActiveRoomId(e.target.value); markLastRoom(e.target.value); }} className="inp max-w-[16rem]">
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.level ? `${r.level} · ` : ""}{r.name} ({ROOM_SCOPES[r.scope] || r.scope})</option>)}
        </select>
        <span className="text-[11px] text-muted">{ROOM_TYPES[room.roomType]}</span>
      </div>

      <div className="space-y-2">
        {prompts.map((p) => {
          const item = itemFor(room.id, p.key);
          return (
            <PromptRow key={p.key} prompt={p} item={item} rooms={rooms}
              onChange={(partial) => {
                if (item) updateItem(item.id, partial);
                else upsertItem(makeItem({ itemKind: p.itemKind, category: p.category, promptKey: p.key, roomId: room.id, level: room.level, room: room.name }), partial);
              }}
              onDelete={item ? () => deleteItem(item.id) : null} />
          );
        })}
        {customItems.map((item) => (
          <PromptRow key={item.id} prompt={{ label: (item.overridesDefaultId ? "From whole-house default — " : "") + (item.description || categoryLabel(item.category) || "Custom item"), category: item.category, itemKind: item.itemKind, custom: true }} item={item} rooms={rooms}
            onChange={(partial) => updateItem(item.id, partial)} onDelete={() => deleteItem(item.id)} />
        ))}
        <button type="button" onClick={() => upsertItem(makeItem({ itemKind: "selection", category: "notes", roomId: room.id, level: room.level, room: room.name }), {})}
          className="text-xs font-semibold text-primary hover:underline">+ Add custom item</button>
      </div>

      <div className="flex items-center justify-between border-t border-hairline pt-3">
        <button type="button" onClick={onPrev} className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-page">← Previous</button>
        <button type="button" onClick={onSaveNext} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">Save &amp; next room →</button>
      </div>
    </div>
  );
}

// ── Step: Outstanding / office review ────────────────────────────────────────────
function OutstandingStep({ reg, rooms, updateItem, deleteItem }) {
  const [fRoom, setFRoom] = useState("");
  const [fCat, setFCat] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);

  let items = reg.items.slice();
  if (onlyOpen) { const open = new Set(outstandingItems(reg).map((i) => i.id)); items = items.filter((i) => open.has(i.id)); }
  if (fRoom) items = items.filter((i) => (fRoom === "__wh__" ? !i.roomId : i.roomId === fRoom));
  if (fCat) items = items.filter((i) => i.category === fCat);
  if (fStatus) items = items.filter((i) => i.certainty === fStatus || i.disposition === fStatus);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5 text-ink"><input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Outstanding only</label>
        <select value={fRoom} onChange={(e) => setFRoom(e.target.value)} className="inp w-40"><option value="">All rooms</option><option value="__wh__">Whole house</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        <select value={fCat} onChange={(e) => setFCat(e.target.value)} className="inp w-44"><option value="">All categories</option>{Object.entries(REGISTER_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="inp w-40"><option value="">Any status</option>{Object.entries(REGISTER_CERTAINTY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}{Object.entries(REGISTER_DISPOSITIONS).map(([k, l]) => <option key={`d_${k}`} value={k}>{l}</option>)}</select>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted">Nothing matches — {onlyOpen ? "no outstanding decisions." : "no items."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-hairline text-left text-muted">
              <th className="py-1 pr-2">Room</th><th className="py-1 pr-2">Category</th><th className="py-1 pr-2">Item / direction</th>
              <th className="py-1 pr-2">Disposition</th><th className="py-1 pr-2">Certainty</th><th className="py-1 pr-2">Next action / owner</th><th></th>
            </tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-hairline/60 align-top">
                  <td className="py-1 pr-2 text-ink">{roomLabel(reg, i)}</td>
                  <td className="py-1 pr-2 text-muted">{categoryLabel(i.category)}</td>
                  <td className="py-1 pr-2"><input value={i.description} onChange={(e) => updateItem(i.id, { description: e.target.value })} className="inp w-full min-w-[10rem]" /></td>
                  <td className="py-1 pr-2">
                    <select value={i.disposition} onChange={(e) => updateItem(i.id, { disposition: e.target.value })} className="inp">{DISPOSITION_ORDER.map((k) => <option key={k} value={k}>{dispositionLabel(k)}</option>)}</select>
                  </td>
                  <td className="py-1 pr-2">
                    {i.itemKind === "selection"
                      ? <select value={i.certainty} onChange={(e) => updateItem(i.id, { certainty: e.target.value })} className="inp">{CERTAINTY_ORDER.map((k) => <option key={k} value={k}>{certaintyLabel(k)}</option>)}</select>
                      : <span className="text-muted">—</span>}
                  </td>
                  <td className="py-1 pr-2">
                    <input value={i.nextAction} onChange={(e) => updateItem(i.id, { nextAction: e.target.value })} placeholder="next action" className="inp w-full min-w-[8rem]" />
                    <select value={i.responsibility} onChange={(e) => updateItem(i.id, { responsibility: e.target.value })} className="inp mt-1 w-full"><option value="">owner —</option>{Object.entries(RESPONSIBILITIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  </td>
                  <td className="py-1"><button type="button" onClick={() => deleteItem(i.id)} className="text-red-500 hover:text-red-700">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Step: Documents (stage-correct draft previews) ───────────────────────────────
function DocumentsStep({ reg, stage, onPreview }) {
  // Stage keys: winning_offer (Concept), consultants, tender, won.
  const btns = [];
  if (stage === "winning_offer") btns.push({ which: "clientBrief", label: "Preview Client Project Brief (draft)" });
  if (stage === "consultants" || stage === "tender" || stage === "won") {
    btns.push({ which: "clientBrief", label: "Preview Client Brief (draft)" });
    btns.push({ which: "architectBrief", label: "Preview Architect Design Brief (draft)" });
    btns.push({ which: "selections", label: "Preview Selections & Finishes (draft)" });
  }
  if (btns.length === 0) btns.push({ which: "clientBrief", label: "Preview Client Brief (draft)" });

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800">
        Drafts are built live from this register — not issued. Nothing is sent, signed, or added to the client portal. Unknowns show as <span className="font-semibold">TBC</span>.
      </div>
      <div className="flex flex-wrap gap-2">
        {btns.map((b) => (
          <button key={b.which + b.label} type="button" onClick={() => onPreview(b.which)} className="rounded-lg border border-hairline px-3 py-2 text-xs font-semibold text-ink hover:bg-page">{b.label}</button>
        ))}
      </div>
      <p className="text-[11px] text-muted">{reg.items.filter(isClientSelection).length} selection item(s) · {outstandingItems(reg).length} outstanding. Issuing a controlled PDF (immutable record) reuses the existing sales document engine — wired in the next increment.</p>
    </div>
  );
}

// ── Reusable: a single prompt/item row (compact; advanced detail behind "More") ───
function PromptRow({ prompt, item, rooms, onChange, onDelete, onApply, isDefault }) {
  const [open, setOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [picked, setPicked] = useState([]);
  const isSelection = (item?.itemKind || prompt.itemKind) === "selection";
  const started = !!item && (item.description || item.product || item.disposition !== "undecided" || item.certainty !== "not_considered");

  return (
    <div className={`rounded-lg border p-2.5 ${started ? "border-hairline bg-page" : "border-dashed border-hairline bg-surface"}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-ink">{prompt.label}</span>
            {!prompt.custom && <span className="rounded bg-page px-1.5 py-0.5 text-[10px] text-muted">{categoryLabel(prompt.category)}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {/* Scope rows lead with disposition; selection rows lead with the note + certainty (the
                decision axis that matters onsite). Disposition for a selection lives under "More". */}
            {!isSelection && (
              <select value={item?.disposition || "undecided"} onChange={(e) => onChange({ disposition: e.target.value })} className="inp w-40 text-[11px]">
                {DISPOSITION_ORDER.map((k) => <option key={k} value={k}>{dispositionLabel(k)}</option>)}
              </select>
            )}
            <input value={item?.description || ""} onChange={(e) => onChange({ description: e.target.value })} placeholder="direction / note…" className="inp min-w-[10rem] flex-1 text-[11px]" />
            {isSelection && (
              <select value={item?.certainty || "not_considered"} onChange={(e) => onChange({ certainty: e.target.value })} className="inp w-36 text-[11px]">
                {CERTAINTY_ORDER.map((k) => <option key={k} value={k}>{certaintyLabel(k)}</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-[11px] text-primary hover:underline">{open ? "Less" : "More"}</button>
          {onDelete && <button type="button" onClick={onDelete} className="text-xs text-red-500 hover:text-red-700">×</button>}
        </div>
      </div>

      {open && (
        <div className="mt-2 grid grid-cols-1 gap-2 border-t border-hairline pt-2 sm:grid-cols-3">
          {isSelection && (
            <LabeledMini label="Scope / disposition">
              <select value={item?.disposition || "undecided"} onChange={(e) => onChange({ disposition: e.target.value })} className="inp text-[11px]">
                {DISPOSITION_ORDER.map((k) => <option key={k} value={k}>{dispositionLabel(k)}</option>)}
              </select>
            </LabeledMini>
          )}
          {isSelection && <><LabeledMini label="Product"><input value={item?.product || ""} onChange={(e) => onChange({ product: e.target.value })} className="inp text-[11px]" /></LabeledMini>
            <LabeledMini label="Model / code"><input value={item?.model || ""} onChange={(e) => onChange({ model: e.target.value })} className="inp text-[11px]" /></LabeledMini>
            <LabeledMini label="Colour / finish"><input value={item?.colour || ""} onChange={(e) => onChange({ colour: e.target.value })} className="inp text-[11px]" /></LabeledMini></>}
          <LabeledMini label="Responsibility">
            <select value={item?.responsibility || ""} onChange={(e) => onChange({ responsibility: e.target.value })} className="inp text-[11px]"><option value="">—</option>{Object.entries(RESPONSIBILITIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </LabeledMini>
          <LabeledMini label="Drawing / supplier ref"><input value={item?.source || ""} onChange={(e) => onChange({ source: e.target.value })} placeholder="sheet+rev / doc no" className="inp text-[11px]" /></LabeledMini>
          <LabeledMini label="Next action"><input value={item?.nextAction || ""} onChange={(e) => onChange({ nextAction: e.target.value })} className="inp text-[11px]" /></LabeledMini>
        </div>
      )}

      {isDefault && started && (
        <div className="mt-2 border-t border-hairline pt-2">
          {!applyOpen ? (
            <button type="button" onClick={() => setApplyOpen(true)} className="text-[11px] font-semibold text-primary hover:underline">Apply to rooms…</button>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted">Copy this default into the selected rooms as editable records:</p>
              <div className="flex flex-wrap gap-1.5">
                {rooms.map((r) => (
                  <label key={r.id} className="flex items-center gap-1 rounded border border-hairline px-1.5 py-0.5 text-[11px]">
                    <input type="checkbox" className="h-3 w-3 accent-primary" checked={picked.includes(r.id)} onChange={(e) => setPicked((cur) => e.target.checked ? [...cur, r.id] : cur.filter((x) => x !== r.id))} />
                    {r.name}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { onApply(picked); setApplyOpen(false); setPicked([]); }} disabled={!picked.length} className="rounded bg-primary px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40">Apply to {picked.length || 0}</button>
                <button type="button" onClick={() => { setApplyOpen(false); setPicked([]); }} className="rounded border border-hairline px-2 py-1 text-[11px] text-ink">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DocPreviewModal({ which, data, onClose }) {
  const title = which === "architectBrief" ? "Architect Design Brief" : which === "selections" ? "Selections & Finishes Schedule" : "Preliminary Client Project Brief";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-card bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-ink">{title} <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">DRAFT — NOT ISSUED</span></h4>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">Close</button>
        </div>
        <p className="mb-3 text-[11px] text-muted">{data.meta.clientName} · {data.meta.projectType} · Drawings {data.meta.planRev}</p>
        {which === "clientBrief" && <ClientBriefPreview b={data.clientBrief} />}
        {which === "architectBrief" && <ArchitectBriefPreview a={data.architectBrief} />}
        {which === "selections" && <SelectionsPreview rows={data.selections} />}
      </div>
    </div>
  );
}

function Section({ title, children }) { return <div className="mb-3"><p className="section-label mb-1">{title}</p>{children}</div>; }
const Empty = () => <p className="text-[11px] italic text-muted">None recorded yet.</p>;

function ClientBriefPreview({ b }) {
  return (
    <div className="text-xs text-ink">
      <Section title="Project goals"><p>{b.goals}</p></Section>
      <Section title="Major scope">{b.majorScope.length ? <ul className="list-disc pl-4">{b.majorScope.map((x, i) => <li key={i}><span className="font-medium">{x.area}:</span> {x.work}</li>)}</ul> : <Empty />}</Section>
      <Section title="Preliminary preferences">{b.preferences.length ? <ul className="list-disc pl-4">{b.preferences.map((x, i) => <li key={i}><span className="font-medium">{x.area}:</span> {x.direction} <span className="text-muted">({x.status})</span></li>)}</ul> : <Empty />}</Section>
      <Section title="Excluded / deferred / by others">{b.excludedDeferred.length ? <ul className="list-disc pl-4">{b.excludedDeferred.map((x, i) => <li key={i}><span className="font-medium">{x.area}:</span> {x.note}</li>)}</ul> : <Empty />}</Section>
      <Section title="Next decisions">{b.nextDecisions.length ? <ul className="list-disc pl-4">{b.nextDecisions.map((x, i) => <li key={i}><span className="font-medium">{x.area}:</span> {x.item} <span className="text-muted">— {x.owner}</span></li>)}</ul> : <Empty />}</Section>
    </div>
  );
}
function ArchitectBriefPreview({ a }) {
  return (
    <div className="text-xs text-ink">
      <Section title="Confirmed desired outcomes">{a.confirmedOutcomes.length ? <ul className="list-disc pl-4">{a.confirmedOutcomes.map((x, i) => <li key={i}><span className="font-medium">{x.area}:</span> {x.outcome} <span className="text-muted">({x.status})</span></li>)}</ul> : <Empty />}</Section>
      <Section title="Proposed design solutions">{a.proposedSolutions.length ? <ul className="list-disc pl-4">{a.proposedSolutions.map((x, i) => <li key={i}><span className="font-medium">{x.area}:</span> {x.proposal}</li>)}</ul> : <Empty />}</Section>
      <Section title="Architect actions (by room / sheet)">{a.actions.length ? <ul className="list-disc pl-4">{a.actions.map((x, i) => <li key={i}><span className="font-medium">{x.area}:</span> {x.action} <span className="text-muted">— {x.sheet} · {x.owner}</span></li>)}</ul> : <Empty />}</Section>
    </div>
  );
}
function SelectionsPreview({ rows }) {
  if (!rows.length) return <Empty />;
  return (
    <div className="overflow-x-auto"><table className="w-full text-[11px]">
      <thead><tr className="border-b border-hairline text-left text-muted"><th className="py-1 pr-2">Room</th><th className="py-1 pr-2">Category</th><th className="py-1 pr-2">Item</th><th className="py-1 pr-2">Product</th><th className="py-1 pr-2">Finish</th><th className="py-1 pr-2">Status</th><th className="py-1 pr-2">Source</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-hairline/60"><td className="py-1 pr-2 text-ink">{r.room}</td><td className="py-1 pr-2">{r.category}</td><td className="py-1 pr-2">{r.item}</td><td className="py-1 pr-2">{r.product}</td><td className="py-1 pr-2">{r.finish}</td><td className="py-1 pr-2">{r.status}</td><td className="py-1 pr-2 text-muted">{r.source}</td></tr>)}</tbody>
    </table></div>
  );
}

function Field({ label, children }) { return <div><label className="mb-1 block text-xs text-muted">{label}</label>{children}</div>; }
function LabeledMini({ label, children }) { return <div><label className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted">{label}</label>{children}</div>; }

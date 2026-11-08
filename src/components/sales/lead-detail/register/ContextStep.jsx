/**
 * ContextStep — "Project" step: what Sales already knows (read-only, never re-asked — Tab 20 §F) and the
 * small amount of setup the register itself owns (drawing basis, delivery model, occupancy, rooms).
 */
import { useState } from "react";
import {
  makeRoom, ROOM_TYPES, ROOM_SCOPES, DELIVERY_MODELS, PROJECT_TYPE_LABELS, isRenovationProject, promptsFor,
  questionById, resolvePromptId, siteLine,
} from "../../../../lib/register.js";
import { PROJECT_TYPES, STAGES } from "../../../../lib/salesPipeline.js";
import { Chip, Field, Section, Select } from "./ui.jsx";
import PromptRow from "./PromptRow.jsx";

const QUICK_ROOMS = [
  ["Entry", "hall"], ["Living", "living"], ["Dining", "dining"], ["Kitchen", "kitchen"], ["Pantry", "pantry"],
  ["Laundry", "laundry"], ["Bathroom", "bathroom"], ["Ensuite", "ensuite"], ["WC", "wc"], ["Bedroom", "bedroom"],
  ["Study", "study"], ["Stairs", "stairs"], ["Garage", "garage"], ["Alfresco", "alfresco"], ["External / site", "external"],
];
const OCCUPANCY = [["vacant", "Vacant during works"], ["occupied", "Occupied during works"], ["partly", "Partly occupied / staged"]];
const PRIORITY_Q = "P-005";
const money = (v) => (v == null ? null : "$" + Math.round(v).toLocaleString("en-AU"));

function Fact({ label, value, id, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label} {id && <span className="normal-case text-muted/70">· {id}</span>}</p>
      <div className="truncate text-xs text-ink">{children || value || <span className="text-muted">Not on file</span>}</div>
    </div>
  );
}

export default function ContextStep({ reg, context, lead, patchLead, setDeliveryModel, mutateMeta, replaceItems, upsertItem, updateItem, deleteItem, addItem, openRoom, actor, stage, readOnly }) {
  const meta = reg.meta;
  const rooms = meta.rooms || [];
  const [qLevel, setQLevel] = useState("Ground");
  const projectType = context?.projectType || lead.project_type || "";
  const reno = isRenovationProject(projectType);
  const ctx = { projectType, deliveryModel: context?.deliveryModel, renovationOverlay: meta.renovationOverlay, stage };
  const brief = promptsFor("project", ctx).filter((q) => q.topic === "brief");
  const mgmt = promptsFor("mgmt", ctx);
  const itemFor = (qid) => reg.items.find((i) => !i.roomId && resolvePromptId(i.promptKey) === qid && !i.overridesDefaultId) || null;

  function setRooms(next) { mutateMeta({ rooms: next.map((r, i) => makeRoom({ ...r, order: i })) }); }
  function addRoom(name = "Room", roomType = "generic") {
    const level = qLevel || "Ground";
    const n = rooms.filter((r) => r.roomType === roomType).length;
    setRooms([...rooms, makeRoom({ name: n && roomType !== "generic" ? `${name} ${n + 1}` : name, roomType, level, scope: reno ? "renovated" : "new" })]);
  }
  function updateRoom(id, partial) { setRooms(rooms.map((r) => (r.id === id ? { ...r, ...partial } : r))); }
  function moveRoom(id, dir) {
    const idx = rooms.findIndex((r) => r.id === id), j = idx + dir;
    if (idx < 0 || j < 0 || j >= rooms.length) return;
    const next = rooms.slice(); [next[idx], next[j]] = [next[j], next[idx]]; setRooms(next);
  }
  function removeRoom(id) {
    const n = reg.items.filter((i) => i.roomId === id).length;
    if (n && !window.confirm(`Remove this room and its ${n} item(s)? Items already issued to the client portal will be kept.`)) return;
    replaceItems((cur) => ({ meta: { ...cur.meta, rooms: cur.meta.rooms.filter((r) => r.id !== id).map((r, i) => makeRoom({ ...r, order: i })) },
      items: cur.items.filter((i) => i.roomId !== id) }));
  }

  // P-005 — up to 3 priorities + a note, stored as ONE requirement item (no new column).
  const pItem = itemFor(PRIORITY_Q);
  const pq = questionById(PRIORITY_Q);
  const chosen = (pItem?.description || "").split(/\s*;\s*/)[0].split(/\s*,\s*/).filter((s) => pq?.options?.includes(s));
  const note = (pItem?.description || "").split(/\s*;\s*/).slice(1).join("; ");
  function setPriorities(list, nextNote = note) {
    const description = [list.join(", "), nextNote].filter(Boolean).join("; ");
    if (pItem) updateItem(pItem.id, { description });
    else addItem({ itemKind: "requirement", category: "notes", promptKey: PRIORITY_Q, section: "project", description, certainty: "preference" });
  }
  // P-006 — areas of the property: one scope item per area.
  const areas = reg.items.filter((i) => !i.roomId && resolvePromptId(i.promptKey) === "P-006");

  return (
    <div className="space-y-3">
      <Section title="On file in Sales — not re-entered here" defaultOpen>
        {!context ? <p className="text-xs text-muted">Loading project context…</p> : (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              <Fact label="Client" id="P-001" value={context.identity.clientName} />
              <Fact label="Site" id="P-001" value={siteLine(context.identity.siteAddress, context.identity.suburb)} />
              <Fact label="Project type" id="P-007">
                {projectType ? PROJECT_TYPE_LABELS[projectType] || projectType : (
                  <select value="" disabled={readOnly} onChange={(e) => patchLead({ project_type: e.target.value || null })} className="inp text-[11px]">
                    <option value="">Set project type…</option>
                    {PROJECT_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
              </Fact>
              <Fact label="Stage" value={STAGES.find((s) => s.id === context.stage)?.label || context.stage} />
              <Fact label="Budget direction" id="P-004" value={context.budget.min || context.budget.max ? `${money(context.budget.min) || "?"} – ${money(context.budget.max) || "?"}` : money(context.budget.estimatedValue)} />
              <Fact label="Desired start" id="P-004" value={context.budget.desiredStart} />
              <Fact label="PTSA / contract" value={[context.commercial.ptsaStatus && `PTSA ${context.commercial.ptsaStatus}`, context.commercial.contractStatus && `Contract ${context.commercial.contractStatus}`].filter(Boolean).join(" · ")} />
              <Fact label="Fee proposal" value={context.commercial.feeProposal ? `${context.commercial.feeProposal.quoteNumber || "Draft"} (${context.commercial.feeProposal.status})` : null} />
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Fact label="Goals & requirements" id="P-004">
                <span className="whitespace-normal">{[context.goals.vision, context.goals.keyRequirements, context.goals.description].filter(Boolean).join(" · ") || <span className="text-muted">Not on file</span>}</span>
              </Fact>
              <Fact label="Consultants on file" id="P-010">
                <span className="whitespace-normal">{context.consultants.length ? context.consultants.map((c) => `${c.role}: ${c.name || "—"}`).join(" · ") : <span className="text-muted">None linked</span>}</span>
              </Fact>
              <Fact label="Concept meetings" id="P-003">
                <span className="whitespace-normal">{context.meetings.length ? context.meetings.map((m) => `${m.type.replace(/_/g, " ")}${m.at ? ` ${new Date(m.at).toLocaleDateString("en-AU")}` : ""}`).join(" · ") : <span className="text-muted">None booked</span>}</span>
              </Fact>
            </div>
            <p className="mt-2 text-[10px] text-muted">Change these in the lead&apos;s own details / Sales stages — the register reads them live.</p>
          </>
        )}
      </Section>

      <Section title="Project setup" defaultOpen>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Current drawing set / revision (P-002)" hint={context?.drawings?.length ? `${context.drawings.length} drawing/consultant file(s) on the lead` : "Upload plans in the Documents tab"}>
            <input value={meta.planRev} disabled={readOnly} onChange={(e) => mutateMeta({ planRev: e.target.value })} placeholder="e.g. DA set Rev C — 04 Nov" className="inp" />
          </Field>
          <Field label="Delivery model (P-007)" hint={context?.deliveryModelSource === "job" ? "Project fact (job)" : "Sales fact (lead)"}>
            <Select value={context?.deliveryModel || ""} onChange={(v) => setDeliveryModel(v || null)} options={Object.entries(DELIVERY_MODELS)} placeholder="—" className="text-xs" disabled={readOnly} />
          </Field>
          <Field label="Occupancy during works (P-008)">
            <Select value={meta.occupancy} onChange={(v) => mutateMeta({ occupancy: v })} options={OCCUPANCY} placeholder="—" className="text-xs" disabled={readOnly} />
          </Field>
          <Field label="Existing-building prompts">
            <label className="flex items-center gap-2 text-xs text-ink">
              <input type="checkbox" className="h-4 w-4 accent-primary" disabled={readOnly || reno} checked={reno || !!meta.renovationOverlay} onChange={(e) => mutateMeta({ renovationOverlay: e.target.checked })} />
              {reno ? "On (renovation / extension)" : "Show demolish / retain / make-good"}
            </label>
          </Field>
        </div>
      </Section>

      <Section title="Rooms & levels — follow the plans" count={rooms.length} defaultOpen>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted">Add on level</span>
          <input value={qLevel} disabled={readOnly} onChange={(e) => setQLevel(e.target.value)} className="inp w-24 text-[11px]" />
          {QUICK_ROOMS.map(([n, t]) => (
            <button key={n} type="button" disabled={readOnly} onClick={() => addRoom(n, t)} className="rounded-full border border-hairline px-2 py-0.5 text-[11px] text-ink hover:bg-page disabled:opacity-40">+ {n}</button>
          ))}
          <button type="button" disabled={readOnly} onClick={() => addRoom()} className="rounded-full border border-dashed border-hairline px-2 py-0.5 text-[11px] text-primary">+ Other</button>
        </div>
        {rooms.length === 0 ? <p className="text-xs text-muted">Add the rooms off the drawings in a natural walk order — you can rename and reorder any time without losing anything recorded.</p> : (
          <div className="space-y-1.5">
            {rooms.map((r, i) => (
              <div key={r.id} className="flex flex-wrap items-center gap-1.5" data-testid={`room-row-${i}`}>
                <div className="flex flex-col">
                  <button type="button" onClick={() => moveRoom(r.id, -1)} disabled={readOnly || i === 0} className="text-[10px] leading-none text-muted hover:text-ink disabled:opacity-30">▲</button>
                  <button type="button" onClick={() => moveRoom(r.id, 1)} disabled={readOnly || i === rooms.length - 1} className="text-[10px] leading-none text-muted hover:text-ink disabled:opacity-30">▼</button>
                </div>
                <input value={r.level} disabled={readOnly} onChange={(e) => updateRoom(r.id, { level: e.target.value })} placeholder="Level" className="inp w-20 text-[11px]" />
                <input value={r.name} disabled={readOnly} onChange={(e) => updateRoom(r.id, { name: e.target.value })} placeholder="Room name" className="inp min-w-[8rem] flex-1 text-[11px]" />
                <Select value={r.roomType} onChange={(v) => updateRoom(r.id, { roomType: v })} options={Object.entries(ROOM_TYPES)} className="w-36" disabled={readOnly} />
                <Select value={r.scope} onChange={(v) => updateRoom(r.id, { scope: v })} options={Object.entries(ROOM_SCOPES)} className="w-32" disabled={readOnly} />
                <input value={r.sheet} disabled={readOnly} onChange={(e) => updateRoom(r.id, { sheet: e.target.value })} placeholder="Sheet / rev" className="inp w-24 text-[11px]" />
                <span className="text-[10px] text-muted">{reg.items.filter((x) => x.roomId === r.id).length} items</span>
                <button type="button" onClick={() => openRoom(r.id)} className="rounded border border-hairline px-2 py-0.5 text-[11px] text-primary hover:bg-surface">Open</button>
                <button type="button" onClick={() => removeRoom(r.id)} disabled={readOnly} className="px-1 text-xs text-red-500 hover:text-red-700 disabled:opacity-30" title="Remove room">×</button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Brief" defaultOpen>
        {pq && (
          <div className="rounded-lg border border-hairline bg-page p-2.5">
            <div className="flex items-center gap-2"><Chip tone="violet">Requirement</Chip><span className="text-xs font-semibold text-ink">{pq.short}</span><span className="text-[10px] text-muted">{pq.id} · pick up to 3</span></div>
            <p className="mt-0.5 text-[11px] text-muted">{pq.text}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {pq.options.map((o) => {
                const on = chosen.includes(o);
                return <button key={o} type="button" disabled={readOnly || (!on && chosen.length >= 3)} onClick={() => setPriorities(on ? chosen.filter((x) => x !== o) : [...chosen, o])}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? "border-primary bg-primary text-white" : "border-hairline text-ink hover:bg-surface"} disabled:opacity-40`}>{o}</button>;
              })}
            </div>
            <input value={note} disabled={readOnly} onChange={(e) => setPriorities(chosen, e.target.value)} placeholder="Note (optional)…" className="inp mt-1.5 w-full text-[11px]" />
          </div>
        )}
        <div className="rounded-lg border border-hairline bg-page p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Chip>Scope / works</Chip><span className="text-xs font-semibold text-ink">{questionById("P-006")?.short}</span><span className="text-[10px] text-muted">P-006</span></div>
            <button type="button" disabled={readOnly} onClick={() => addItem({ itemKind: "scope", category: "scope", promptKey: "P-006", section: "project", disposition: "included" })} className="text-[11px] font-semibold text-primary hover:underline">+ Area</button>
          </div>
          <p className="mt-0.5 text-[11px] text-muted">{questionById("P-006")?.text}</p>
          <div className="mt-1.5 space-y-1">
            {areas.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-1.5">
                <input value={a.description} disabled={readOnly} onChange={(e) => updateItem(a.id, { description: e.target.value })} placeholder="Area (e.g. rear extension, front garden)" className="inp min-w-[10rem] flex-1 text-[11px]" />
                {[["included", "Included"], ["undecided", "Optional / undecided"], ["excluded", "Excluded"], ["deferred", "Deferred"]].map(([k, l]) => (
                  <button key={k} type="button" disabled={readOnly} onClick={() => updateItem(a.id, { disposition: k })}
                    className={`rounded-full border px-2 py-0.5 text-[10px] ${a.disposition === k ? "border-primary bg-primary text-white" : "border-hairline text-muted"}`}>{l}</button>
                ))}
                <button type="button" disabled={readOnly} onClick={() => deleteItem(a.id)} className="px-1 text-xs text-red-500">×</button>
              </div>
            ))}
          </div>
        </div>
        {brief.filter((q) => !["P-005", "P-006", "P-008"].includes(q.id)).map((q) => {
          const item = itemFor(q.id);
          return (
            <PromptRow key={q.id} question={q} item={item} actor={actor} readOnlyReason={readOnly ? "Read-only" : null}
              seed={{ itemKind: q.itemKind, category: q.category, promptKey: q.id, section: "project", technicalStatus: q.technical, responsibility: q.owner || "" }}
              onChange={(partial) => (item ? updateItem(item.id, partial) : upsertItem({ itemKind: q.itemKind, category: q.category, promptKey: q.id, section: "project", technicalStatus: q.technical, responsibility: q.owner || "" }, partial))}
              onDelete={item ? () => deleteItem(item.id) : null} />
          );
        })}
      </Section>

      {mgmt.length > 0 && (
        <Section title={`Responsibilities — ${DELIVERY_MODELS[context?.deliveryModel] || ""} overlay`} count={mgmt.length} defaultOpen={false}>
          {mgmt.map((q) => {
            const item = itemFor(q.id);
            return (
              <PromptRow key={q.id} question={q} item={item} actor={actor} readOnlyReason={readOnly ? "Read-only" : null}
                seed={{ itemKind: q.itemKind, category: q.category, promptKey: q.id, section: "mgmt", technicalStatus: q.technical }}
                onChange={(partial) => (item ? updateItem(item.id, partial) : upsertItem({ itemKind: q.itemKind, category: q.category, promptKey: q.id, section: "mgmt", technicalStatus: q.technical }, partial))}
                onDelete={item ? () => deleteItem(item.id) : null} />
            );
          })}
        </Section>
      )}
    </div>
  );
}

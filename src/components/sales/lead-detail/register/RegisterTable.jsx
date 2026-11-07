/**
 * RegisterTable — the office view of the SAME register (Tab 18 §3 "Review register"): a compact,
 * filterable, inline-editable list. Edits write the same canonical records as the room walkthrough —
 * there is no parallel office copy. Also hosts the technical-coordination library (Tab 21 §12: office /
 * consultant actions, never an onsite questionnaire) and bulk "issue to client portal".
 */
import { useMemo, useState } from "react";
import {
  roomLabel, refCode, outstandingReasons, promptsFor, resolvePromptId, isClientSelection, TECH_TOPICS,
  REGISTER_DISPOSITIONS, DISPOSITION_ORDER, REGISTER_CERTAINTY, CERTAINTY_ORDER, TECHNICAL_STATUSES, PRICING_STATUSES,
  RESPONSIBILITIES, ITEM_KINDS, REGISTER_CATEGORIES, categoryLabel,
} from "../../../../lib/register.js";
import { Chip, Select } from "./ui.jsx";
import PromptRow from "./PromptRow.jsx";

const REASON_LABEL = { decision: "Decision", verification: "Verification", action: "Action" };

export default function RegisterTable({ reg, context, stage, info, actor, updateItem, deleteItem, addItem, onPortalItems, onPortalItem, readOnly }) {
  const [f, setF] = useState({ q: "", room: "", kind: "", cat: "", disp: "", cert: "", tech: "", price: "", owner: "", open: true, portal: "" });
  const [expanded, setExpanded] = useState(null);
  const [picked, setPicked] = useState([]);
  const [techAdd, setTechAdd] = useState("");
  const rooms = useMemo(() => reg.meta.rooms || [], [reg.meta.rooms]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const rows = useMemo(() => {
    let items = reg.items.slice();
    if (f.open) items = items.filter((i) => outstandingReasons(i).length);
    if (f.room) items = items.filter((i) => (f.room === "__project" ? !i.roomId : i.roomId === f.room));
    if (f.kind) items = items.filter((i) => i.itemKind === f.kind);
    if (f.cat) items = items.filter((i) => i.category === f.cat);
    if (f.disp) items = items.filter((i) => i.disposition === f.disp);
    if (f.cert) items = items.filter((i) => i.certainty === f.cert);
    if (f.tech) items = items.filter((i) => i.technicalStatus === f.tech);
    if (f.price) items = items.filter((i) => i.pricingStatus === f.price);
    if (f.owner) items = items.filter((i) => i.responsibility === f.owner);
    if (f.portal) items = items.filter((i) => (f.portal === "staged" ? i.sync?.table === "client_selections" && !i.sync.clientVisible
      : f.portal === "live" ? i.sync?.clientVisible : f.portal === "review" ? i.sync?.status === "in_review" : true));
    if (f.q.trim()) {
      const q = f.q.trim().toLowerCase();
      items = items.filter((i) => [i.description, i.product, i.model, i.source, i.nextAction, i.supplier, refCode(i)].some((v) => String(v || "").toLowerCase().includes(q)));
    }
    const order = new Map(rooms.map((r, i) => [r.id, i]));
    return items.sort((a, b) => (a.roomId ? order.get(a.roomId) ?? 999 : -1) - (b.roomId ? order.get(b.roomId) ?? 999 : -1));
  }, [reg, f, rooms]);

  const counts = useMemo(() => {
    const c = { total: reg.items.length, decision: 0, verification: 0, action: 0, staged: 0, live: 0, review: 0 };
    for (const i of reg.items) {
      for (const r of outstandingReasons(i)) c[r] += 1;
      if (i.sync?.table === "client_selections") { if (i.sync.clientVisible) c.live += 1; else c.staged += 1; if (i.sync.status === "in_review") c.review += 1; }
    }
    return c;
  }, [reg]);

  const techQs = promptsFor("tech", { projectType: context?.projectType, renovationOverlay: reg.meta.renovationOverlay, stage, showDetail: true });
  const techUsed = new Set(reg.items.filter((i) => !i.roomId).map((i) => resolvePromptId(i.promptKey)));
  const stagedSelections = rows.filter((i) => i.sync?.table === "client_selections" && !i.sync.clientVisible && !i.sync.locked && isClientSelection(i));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span><b className="text-ink">{counts.total}</b> items</span>
        <span>· {counts.decision} decisions</span><span>· {counts.verification} to verify</span><span>· {counts.action} actions</span>
        {info.mode === "project" && <span>· portal: {counts.staged} staged / {counts.live} issued{counts.review ? ` / ${counts.review} to review` : ""}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <input value={f.q} onChange={(e) => set("q", e.target.value)} placeholder="Search item, product, ref…" className="inp w-44 text-[11px]" />
        <label className="flex items-center gap-1 text-ink"><input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={f.open} onChange={(e) => set("open", e.target.checked)} /> Outstanding only</label>
        <Select value={f.room} onChange={(v) => set("room", v)} options={[["__project", "Whole house / site"], ...rooms.map((r) => [r.id, r.name])]} placeholder="All rooms" className="w-36" />
        <Select value={f.kind} onChange={(v) => set("kind", v)} options={Object.entries(ITEM_KINDS)} placeholder="Any type" className="w-32" />
        <Select value={f.cat} onChange={(v) => set("cat", v)} options={Object.entries(REGISTER_CATEGORIES)} placeholder="Any category" className="w-36" />
        <Select value={f.disp} onChange={(v) => set("disp", v)} options={DISPOSITION_ORDER.map((k) => [k, REGISTER_DISPOSITIONS[k]])} placeholder="Any scope status" className="w-36" />
        <Select value={f.cert} onChange={(v) => set("cert", v)} options={CERTAINTY_ORDER.map((k) => [k, REGISTER_CERTAINTY[k]])} placeholder="Any decision" className="w-32" />
        <Select value={f.tech} onChange={(v) => set("tech", v)} options={Object.entries(TECHNICAL_STATUSES)} placeholder="Any verification" className="w-36" />
        <Select value={f.price} onChange={(v) => set("price", v)} options={Object.entries(PRICING_STATUSES)} placeholder="Any pricing" className="w-32" />
        <Select value={f.owner} onChange={(v) => set("owner", v)} options={Object.entries(RESPONSIBILITIES)} placeholder="Any owner" className="w-36" />
        {info.mode === "project" && <Select value={f.portal} onChange={(v) => set("portal", v)} options={[["staged", "Staged (internal)"], ["live", "On client portal"], ["review", "Client choice to review"]]} placeholder="Any portal state" className="w-40" />}
      </div>

      {info.mode === "project" && stagedSelections.length > 0 && !readOnly && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-hairline bg-page px-2 py-1.5 text-[11px]">
          <span className="text-muted">{picked.length ? `${picked.length} selected` : "Tick staged selections to issue them to the client portal"}</span>
          <button type="button" disabled={!picked.length} onClick={() => { onPortalItems("issue", reg.items.filter((i) => picked.includes(i.id))); setPicked([]); }}
            className="rounded bg-primary px-2 py-1 font-semibold text-white disabled:opacity-40">Issue to client portal</button>
          <span className="text-muted">Nothing reaches the client until you do this. Scope, requirements and actions can never be issued.</span>
        </div>
      )}

      {rows.length === 0 ? <p className="text-sm text-muted">Nothing matches{f.open ? " — no outstanding items" : ""}.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]" data-testid="register-table">
            <thead><tr className="border-b border-hairline text-left text-muted">
              {info.mode === "project" && <th className="py-1 pr-1"></th>}
              <th className="py-1 pr-2">Ref</th><th className="py-1 pr-2">Room</th><th className="py-1 pr-2">Type</th><th className="py-1 pr-2">Item / direction</th>
              <th className="py-1 pr-2">Scope</th><th className="py-1 pr-2">Decision</th><th className="py-1 pr-2">Technical</th><th className="py-1 pr-2">Pricing</th>
              <th className="py-1 pr-2">Owner / next action</th><th className="py-1 pr-2">Source</th><th className="py-1 pr-2">Open</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map((i) => {
                const reasons = outstandingReasons(i);
                const lock = !!i.sync?.locked;
                const canPick = i.sync?.table === "client_selections" && !i.sync.clientVisible && !lock;
                return [
                  <tr key={i.id} className="border-b border-hairline/60 align-top" data-testid={`reg-row-${i.id}`}>
                    {info.mode === "project" && <td className="py-1 pr-1">{canPick && !readOnly && <input type="checkbox" className="h-3 w-3 accent-primary" checked={picked.includes(i.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id)))} />}</td>}
                    <td className="py-1 pr-2 font-mono text-[10px] text-muted">{refCode(i)}</td>
                    <td className="py-1 pr-2 text-ink">{roomLabel(reg, i)}</td>
                    <td className="py-1 pr-2"><Chip tone={i.itemKind === "selection" ? "blue" : i.itemKind === "requirement" ? "violet" : i.itemKind === "action" ? "amber" : "slate"}>{ITEM_KINDS[i.itemKind]}</Chip><div className="mt-0.5 text-[10px] text-muted">{categoryLabel(i.category)}</div></td>
                    <td className="py-1 pr-2"><input value={i.description} disabled={readOnly || lock} onChange={(e) => updateItem(i.id, { description: e.target.value })} className="inp w-full min-w-[10rem] text-[11px]" />
                      {i.product && <div className="mt-0.5 text-[10px] text-muted">{[i.manufacturer, i.product, i.model].filter(Boolean).join(" · ")}</div>}</td>
                    <td className="py-1 pr-2"><Select value={i.disposition} onChange={(v) => updateItem(i.id, { disposition: v })} options={DISPOSITION_ORDER.map((k) => [k, REGISTER_DISPOSITIONS[k]])} disabled={readOnly || lock} /></td>
                    <td className="py-1 pr-2">{i.itemKind === "selection" || i.itemKind === "requirement"
                      ? <span className={i.certainty === "client_approved" ? "font-semibold text-green-700" : "text-ink"}>{REGISTER_CERTAINTY[i.certainty]}</span>
                      : <span className="text-muted">—</span>}</td>
                    <td className="py-1 pr-2"><span className={i.technicalStatus === "needs_verification" ? "text-amber-700" : i.technicalStatus === "verified" ? "text-green-700" : "text-muted"}>{TECHNICAL_STATUSES[i.technicalStatus]}</span></td>
                    <td className="py-1 pr-2 text-muted">{i.itemKind === "selection" || i.itemKind === "scope" ? PRICING_STATUSES[i.pricingStatus] : "—"}{i.pricingRef ? <div className="text-[10px]">{i.pricingRef}</div> : null}</td>
                    <td className="py-1 pr-2">
                      <Select value={i.responsibility} onChange={(v) => updateItem(i.id, { responsibility: v })} options={Object.entries(RESPONSIBILITIES)} placeholder="owner —" disabled={readOnly} />
                      <input value={i.nextAction} disabled={readOnly} onChange={(e) => updateItem(i.id, { nextAction: e.target.value, resolved: false })} placeholder="next action" className="inp mt-1 w-full min-w-[8rem] text-[11px]" />
                    </td>
                    <td className="py-1 pr-2"><input value={i.source} disabled={readOnly} onChange={(e) => updateItem(i.id, { source: e.target.value })} placeholder="sheet / doc" className="inp w-24 text-[11px]" /></td>
                    <td className="py-1 pr-2">{reasons.map((r) => <div key={r}><Chip tone="amber">{REASON_LABEL[r]}</Chip></div>)}</td>
                    <td className="py-1 text-right whitespace-nowrap">
                      <button type="button" onClick={() => setExpanded(expanded === i.id ? null : i.id)} className="px-1 text-primary hover:underline">{expanded === i.id ? "Close" : "Edit"}</button>
                      {!readOnly && <button type="button" onClick={() => deleteItem(i.id)} className="px-1 text-red-500 hover:text-red-700">×</button>}
                    </td>
                  </tr>,
                  expanded === i.id && (
                    <tr key={`${i.id}-x`}><td colSpan={13} className="pb-2">
                      <PromptRow question={null} item={i} actor={actor} compact readOnlyReason={readOnly ? "Read-only" : null}
                        onChange={(partial) => updateItem(i.id, partial)} onDelete={() => deleteItem(i.id)} onPortal={(a, ev) => onPortalItem(i, a, ev)} />
                    </td></tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border border-hairline bg-page p-2.5">
        <p className="section-label mb-1">Technical coordination (office / consultant — not client questions)</p>
        <p className="mb-1.5 text-[11px] text-muted">Add an element check only when that system is in scope. It becomes an owned action marked “needs verification” and appears in the Architect Brief and tender risks.</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <select value={techAdd} onChange={(e) => setTechAdd(e.target.value)} className="inp max-w-[28rem] text-[11px]" disabled={readOnly}>
            <option value="">Choose a coordination check…</option>
            {TECH_TOPICS.map((t) => (
              <optgroup key={t.key} label={t.label}>
                {techQs.filter((q) => q.topic === t.key).map((q) => <option key={q.id} value={q.id} disabled={techUsed.has(q.id)}>{q.id} {q.short}{techUsed.has(q.id) ? " (added)" : ""}</option>)}
              </optgroup>
            ))}
          </select>
          <button type="button" disabled={!techAdd || readOnly} onClick={() => {
            const q = techQs.find((x) => x.id === techAdd);
            if (q) addItem({ itemKind: "action", category: q.category, promptKey: q.id, section: "tech", description: q.text, technicalStatus: "needs_verification", responsibility: q.owner || "" });
            setTechAdd("");
          }} className="rounded bg-primary px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40">Add</button>
        </div>
      </div>
    </div>
  );
}

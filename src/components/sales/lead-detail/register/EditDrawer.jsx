/**
 * EditDrawer — "Edit what prints" (REGISTER_SCREENS_SPEC.md S5 G; A2 click-a-line-to-edit). A printed line, a Fix, or a
 * record that didn't print opens its source here, beside the PDF, so staff fix it without leaving the document:
 *
 *   record     the record itself (the same row as everywhere else: chips, words, ⚑, ⋯ → Product details)
 *   room       the room: name, floor, Work, the earlier-answer banner, the room brief, Connects to, must-haves
 *   rooms      the Rooms list in tick mode (choose upstairs rooms)
 *   fact       the client's story and budget fields (saved to the client's details: Sales shows the same)
 *   architect  name the architect (the design-team contact)
 *   meta       the drawing basis
 *   site       public mapping, read only, with Re-check
 *   template   standard wording, read only
 *
 * A right panel (440 px) on desktop and tablet with the PDF still visible; a 90% bottom sheet on a phone. Saving rules
 * are the same as everywhere: records save through updateItem (an edit that outruns a client approval drops it back to
 * Proposed, with a notice), rooms through mutateMeta, facts through patchLead.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { questionById, resolvePromptId, refCode } from "../../../../lib/register.js";
import { HELD_BACK_WORDS, labelOf, placeOf, clean, namedArchitect } from "../../../../lib/briefModel.js";
import { apiPost } from "../../../../lib/apiFetch.js";
import PromptRow from "./PromptRow.jsx";
import RoomBriefCard from "./RoomBriefCard.jsx";
import RoomsList from "./RoomsList.jsx";
import StoryFields from "./StoryFields.jsx";
import { NameArchitectPanel } from "./DesignTeamCard.jsx";

const NOT_PRINTED_WORDS = {
  schedule: "Won't print here: it's in the Technical Selections Schedule.",
  client: "Won't print here: it's the client's choice, in the client's brief.",
  empty: "Won't print: it holds nothing yet.",
  office: "Won't print: it's kept for the office.",
};
/** Which story fields the drawer shows for a fact key (the rest stay on the Project step). */
const FACT_FIELDS = {
  vision: ["vision", "must_haves", "concern"], must_haves: ["vision", "must_haves", "concern"], concern: ["vision", "must_haves", "concern"],
  story: ["vision", "must_haves", "concern", "budget", "confirmed"], budget: ["budget", "confirmed"], funding: ["paying", "start"],
};
const SITE_WORDS = "From public mapping. It can't be edited here — re-check if the site or address changed.";

function useIsPhone() {
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(max-width: 639px)").matches);
  useEffect(() => {
    const mq = window.matchMedia?.("(max-width: 639px)");
    if (!mq) return undefined;
    const on = () => setPhone(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return phone;
}

export default function EditDrawer({
  target, lead, reg, context, actor, readOnly, saveStateOf, updateItem, deleteItem, upsertItem, addItem, mutateMeta, replaceItems, patchLead, reloadContext,
  onPortalItem, onClose, onPreview, onNext, nextLabel, onOpenRoom, saveText,
}) {
  const phone = useIsPhone();
  const panel = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => { panel.current?.focus(); }, [target]);
  const [siteMsg, setSiteMsg] = useState(null);
  const items = useMemo(() => (target?.ids || []).map((id) => reg.items.find((i) => i.id === id)).filter(Boolean), [target, reg.items]);
  if (!target) return null;
  const architectNow = namedArchitect(context);
  const rooms = (target.roomIds || []).map((id) => (reg.meta.rooms || []).find((r) => r.id === id)).filter(Boolean);

  async function recheck() {
    setSiteMsg("Checking public mapping…");
    // Same route as the Project step: the job's site once a job exists, else the lead's.
    const onJob = context?.owner === "job" && lead.job_id;
    const r = await apiPost(`/api/geo/enrich/${onJob ? "jobs" : "leads"}/${onJob ? lead.job_id : lead.id}`, {});
    if (r.ok) { setSiteMsg(`Updated ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Adelaide" })}`); reloadContext?.(); }
    else setSiteMsg("Couldn't reach the mapping service. Nothing changed.");
  }

  const body = (() => {
    switch (target.kind) {
      case "record":
        if (!items.length) return <p className="text-sm text-muted">This record has been removed.</p>;
        return items.map((i) => (
          <div key={i.id} className="space-y-1.5 border-b border-hairline pb-3 last:border-0" data-testid={`drawer-record-${i.id}`}>
            {(items.length > 1 || target.reasons?.[i.id]) && <p className="text-[13px] text-muted">From {placeOf(reg, i).label}: {labelOf(i)}</p>}
            {target.reasons?.[i.id] && (
              <p className="rounded-lg border border-warning/60 bg-warning/10 px-3 py-2 text-[13px] text-ink">
                {HELD_BACK_WORDS[target.reasons[i.id]] ? `Won't print: ${HELD_BACK_WORDS[target.reasons[i.id]]}.` : NOT_PRINTED_WORDS[target.reasons[i.id]] || ""}
              </p>
            )}
            <PromptRow question={questionById(resolvePromptId(i.promptKey)) || null} item={i} actor={actor} compact readOnlyReason={readOnly ? "Read-only" : null}
              saveState={saveStateOf(i.id)} onChange={(partial) => updateItem(i.id, partial)} onDelete={() => deleteItem(i.id)} onPortal={(a, ev) => onPortalItem?.(i, a, ev)} />
            <p className="text-[11px] text-muted">Staff reference {refCode(i)}</p>
          </div>
        ));
      case "room":
        if (!rooms.length) return <p className="text-sm text-muted">This room has been removed.</p>;
        return rooms.map((room) => (
          <div key={room.id} className="space-y-2 border-b border-hairline pb-3 last:border-0">
            <RoomBriefCard reg={reg} room={room} context={context} upsertItem={upsertItem} updateItem={updateItem} deleteItem={deleteItem} addItem={addItem} mutateMeta={mutateMeta}
              readOnly={readOnly} compact onOpenRoom={onOpenRoom ? () => onOpenRoom(room.id) : undefined} />
          </div>
        ));
      case "rooms":
        return <RoomsList reg={reg} context={context} mutateMeta={mutateMeta} replaceItems={replaceItems} openRoom={(id) => onOpenRoom?.(id)} readOnly={readOnly} startTickMode={target.key === "floors"} />;
      case "fact":
        return (
          <div className="space-y-2">
            <StoryFields context={context} patchLead={patchLead} readOnly={readOnly} fields={FACT_FIELDS[target.key] || FACT_FIELDS.story} />
            <p className="text-[12px] text-muted">Saved to the client&apos;s details — Sales shows the same.</p>
          </div>
        );
      case "architect":
        // With an architect already named, this changes them (one architect, decision 6); otherwise it names one.
        return <NameArchitectPanel lead={lead} context={context} onSaved={() => reloadContext?.()} role="architect"
          replaces={architectNow ? { roleId: architectNow.roleId || null, contactId: architectNow.contactId || null } : null} />;
      case "meta":
        if (target.key === "occupancy") return (
          <div className="space-y-1">
            <span className="text-[13px] text-muted">During the works</span>
            <div className="grid grid-cols-3 gap-1" role="group" aria-label="During the works">
              {[["vacant", "Moving out"], ["partly", "Partly lived in"], ["occupied", "Living there"]].map(([k, l]) => (
                <button key={k} type="button" disabled={readOnly} aria-pressed={reg.meta.occupancy === k} onClick={() => mutateMeta({ occupancy: k })}
                  className={`min-h-[44px] rounded-lg border text-sm font-semibold ${reg.meta.occupancy === k ? "border-primary bg-primary text-white" : "border-hairline text-ink hover:bg-page"}`}>{l}</button>
              ))}
            </div>
          </div>
        );
        return (
          <label className="block space-y-1">
            <span className="text-[13px] text-muted">Drawings this brief is based on</span>
            <input defaultValue={reg.meta.planRev || ""} disabled={readOnly} onBlur={(e) => clean(e.target.value) !== (reg.meta.planRev || "") && mutateMeta({ planRev: clean(e.target.value) })}
              placeholder="e.g. DA rev 3" className="inp min-h-[44px] w-full text-[16px] sm:text-[15px]" data-testid="drawer-planrev" />
          </label>
        );
      case "site":
        return (
          <div className="space-y-2">
            <p className="text-sm text-ink">{target.text}</p>
            <p className="text-[13px] text-muted">{SITE_WORDS}</p>
            {/* POST /api/geo/enrich is admin-only: everyone else sees the values (as on the Project step). */}
            {!readOnly && actor?.role === "admin" && (
              <button type="button" onClick={recheck} className="min-h-[44px] rounded-lg border border-hairline px-3 text-sm font-semibold text-ink hover:bg-page">Re-check</button>
            )}
            {siteMsg && <p className="text-[12px] text-muted">{siteMsg}</p>}
          </div>
        );
      case "sales":
        return <p className="text-sm text-muted">From the client&apos;s details in Sales. Change it there; the brief reads it each time it&apos;s previewed.</p>;
      default:
        return <p className="text-sm text-muted">Standard wording in every architect&apos;s brief. It can&apos;t be changed here.</p>;
    }
  })();

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Edit what prints">
      <button type="button" aria-label="Close" onClick={onClose} className={`absolute inset-0 ${phone ? "bg-black/30" : "bg-transparent"} cursor-default`} />
      <div ref={panel} tabIndex={-1}
        className={`relative flex flex-col bg-surface shadow-2xl outline-none ${phone ? "mt-auto h-[90vh] w-full rounded-t-2xl" : "h-full w-[440px] max-w-full border-l border-hairline"}`}
        data-testid="edit-drawer">
        {phone && <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-hairline" aria-hidden="true" />}
        <div className="flex items-start gap-2 border-b border-hairline px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-ink">Edit what prints</p>
            {target.line && <p className="line-clamp-2 text-[13px] text-muted">“{target.line}”</p>}
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-lg text-xl text-muted hover:bg-page hover:text-ink" aria-label="Close">×</button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">{body}</div>
        <div className="flex min-h-[64px] items-center gap-2 border-t border-hairline px-4 py-2">
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted" data-testid="drawer-save-state">{saveText}</span>
          {onNext && <button type="button" onClick={onNext} className="min-h-[44px] px-2 text-[13px] font-semibold text-primary hover:underline">{nextLabel || "Next warning ›"}</button>}
          <button type="button" onClick={onPreview} className="min-h-[44px] rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:opacity-90" data-testid="drawer-preview-again">Preview again</button>
        </div>
      </div>
    </div>
  );
}

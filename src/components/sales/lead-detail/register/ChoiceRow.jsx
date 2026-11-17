/**
 * ChoiceRow — one flat row per choice on a room screen (REGISTER_SCREENS_SPEC.md S3 card 5, S3p): the label, an optional
 * status line, the chips, and top right ⚑ (Needs action from…) and ⋯. No question codes, no kind or category chips, no help
 * line (it is the label's hover title, or a long-press), no "Recorded:" echo.
 *
 * The chips use the existing answer machinery (registerChoice.js: choiceView, toggleOption, itemPatch …) exactly as the
 * ProgressiveChoiceCard does, so a tap stores the same answer it always did. "Not decided yet", "Not needed here", the
 * office note, the settle-out answers and "Product details…" (the full PromptRow: office fields, approvals, portal) sit
 * behind ⋯. The K-005 "Engineered stone" option is never offered; an existing one shows as not allowed.
 *
 * Also exported:
 *   ChoiceChips   the chips alone (the room brief's must-haves use them)
 *   ChoiceRepeat  one row per record for a question that repeats, with "+ Add another"
 *   ApplianceRow  K-008: one chip per appliance, each tap one record (stable id per appliance), "Mostly supplied by"
 */
import { useRef, useState } from "react";
import {
  makeItem, genId, configForRow, isGuidedConfig, answerIsEditable, choiceView, itemPatch, toggleOption, setOpenWords, removeChoice, reuseChoice,
  chooseZone, chooseElement, setZoneWords, setElementWords, toggleArea, toggleNotDecided, toggleNotApplicable, setAnswerNote, settleOptions,
  settlePatch, statedText, dispositionLabel, UNRESOLVED_REASONS, RESPONSIBILITIES, HIDDEN_OPTION_IDS,
} from "../../../../lib/register.js";
import { clean, labelOf } from "../../../../lib/briefModel.js";
import { usableNotedWords, notAllowedOption } from "../../../../lib/roomScreen.js";
import { NeedsActionFlag } from "./NeedsAction.jsx";
import PromptRow from "./PromptRow.jsx";
import { ChoiceChip, ChipLine, DraftInput, IconButton, MenuDivider, MenuItem, Popover, Segmented, Confirm } from "./RoomUi.jsx";
import { useNarrow } from "./useRoomUi.js";

const tidyWords = (v) => statedText(String(v || "").trim());
const inputCls = "inp w-full text-base sm:text-sm";
const textBtn = "focus-ring inline-flex min-h-[44px] items-center rounded px-1 text-sm font-bold text-primary hover:underline";
const SETTLED = new Set(["by_others", "excluded", "deferred", "retain"]);

/**
 * The chips for one record, from the answer machinery. qid: the question the record answers (for the not-allowed rule).
 * onPatch(partial) receives the same item patch the ProgressiveChoiceCard would write.
 */
export function ChoiceChips({ qid, config, item, disabled, onPatch, usedZones, coveredQuestions, fixedZone, areaOptions, showNoted = true, testId }) {
  const view = choiceView(config, item.answer, { showDetail: true, usedZones, coveredQuestions });
  const write = (next, extra) => onPatch(itemPatch(item, config, next, extra));
  const hidden = HIDDEN_OPTION_IDS[qid] || null;
  const hasDetails = !!(item.product || item.model || item.colour);
  const typed = clean(item.description);
  const noted = showNoted && !config.asksWhat && typed ? usableNotedWords(config, item) : null;
  const tid = testId || qid || item.id;
  return (
    <div className="space-y-2.5" data-testid={`chips-${tid}`}>
      {config.asksWhat && (
        <DraftInput value={item.description} onCommit={(v) => onPatch({ description: v })} disabled={disabled} aria-label="What is it"
          placeholder={item.itemKind === "action" ? "What needs to happen…" : "What item…"} className={inputCls} />
      )}
      {view.zone && !fixedZone && (
        <ChipLine heading="Applies to">
          {view.zone.options.map((o) => <ChoiceChip key={o.id} on={o.on} disabled={disabled || o.disabled} onClick={() => write(chooseZone(config, item.answer, o.id))}>{o.label}</ChoiceChip>)}
        </ChipLine>
      )}
      {view.zone?.open && (
        <DraftInput value={view.zone.words} tidy={tidyWords} disabled={disabled} onCommit={(v) => write(setZoneWords(config, item.answer, v))} placeholder="Which area…" aria-label="Which area" className={inputCls} />
      )}
      {config.flow?.includes("area") && areaOptions?.length > 0 && (
        <ChipLine heading="Where">
          {areaOptions.map((o) => <ChoiceChip key={o.id} on={(item.answer?.areaIds || []).includes(o.id)} disabled={disabled} onClick={() => write(toggleArea(config, item.answer, o.id))}>{o.label}</ChoiceChip>)}
        </ChipLine>
      )}
      {view.element && (
        <ChipLine heading="Which">
          {view.element.options.map((o) => <ChoiceChip key={o.id} on={o.on} disabled={disabled} onClick={() => write(chooseElement(config, item.answer, o.id))}>{o.label}</ChoiceChip>)}
        </ChipLine>
      )}
      {view.element?.open && (
        <DraftInput value={view.element.words} tidy={tidyWords} disabled={disabled} onCommit={(v) => write(setElementWords(config, item.answer, v))} placeholder="Which one…" aria-label="Which one" className={inputCls} />
      )}
      {view.levels.map((level, k) => {
        const options = level.options.filter((o) => !(hidden?.has(o.id) && !o.on));
        if (!options.length) return null;
        return (
          <ChipLine key={level.key} heading={k || view.element ? level.heading : null}>
            {options.map((o) => (hidden?.has(o.id)
              ? <ChoiceChip key={o.id} tone="bad" disabled={disabled} title={`${o.label} can't be used. Tap to take it off, then choose another with the client.`}
                  onClick={() => write(toggleOption(config, item.answer, o.path, { keepReplaced: hasDetails }))}>{o.label} · not allowed</ChoiceChip>
              : <ChoiceChip key={o.id} on={o.on} disabled={disabled || o.disabled} testId={`choice-${tid}-${o.path.join("-")}`}
                  onClick={() => write(toggleOption(config, item.answer, o.path, { keepReplaced: hasDetails }))}>{o.label}</ChoiceChip>))}
            {options.filter((o) => o.openRows.length).flatMap((o) => o.openRows.map((row, i) => (
              <span key={`${o.id}-${i}`} className="flex w-full items-center gap-1">
                <DraftInput value={row.words} tidy={tidyWords} disabled={disabled} placeholder="Say what…" aria-label={`${o.label}: say what`} className={inputCls}
                  onCommit={(v) => write(setOpenWords(config, item.answer, o.path, row.label, v))} />
                {row.words && !disabled && <button type="button" className={textBtn} onClick={() => write(removeChoice(config, item.answer, { path: o.path, label: row.label }))}>Remove</button>}
              </span>
            )))}
          </ChipLine>
        );
      })}
      {view.kept.length > 0 && (
        <div className="rounded-lg border border-warning/60 bg-warning/10 px-3 py-2 text-sm text-ink">
          <p className="font-bold">Chosen before an earlier answer changed:</p>
          <ul className="mt-1 space-y-0.5">
            {view.kept.map((k) => (
              <li key={k.key} className="flex flex-wrap items-center gap-x-2">
                <span>{k.label}</span>
                {k.canReuse && !disabled && <button type="button" className={textBtn} onClick={() => write(reuseChoice(config, item.answer, k))}>Use again</button>}
                {!disabled && <button type="button" className={textBtn} onClick={() => write(removeChoice(config, item.answer, k))}>Remove</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {showNoted && !config.asksWhat && typed && (
        <p className="flex flex-wrap items-center gap-x-2.5 text-[13px] text-muted">
          <span>Noted earlier: {typed}</span>
          {noted && !disabled && <button type="button" className={textBtn} onClick={() => onPatch(noted.patch)} data-testid={`use-noted-${tid}`}>Use these</button>}
        </p>
      )}
    </div>
  );
}

/** The status line under a row's label, from what's on the record. */
function statusOf(item, view, config, qid, saveState) {
  const out = [];
  if (item.sync?.locked) out.push({ text: "Approved under the contract — change it through a variation.", tone: "muted" });
  const bad = notAllowedOption(qid, item);
  if (bad) out.push({ text: `${bad.label} can't be used — choose another with the client`, tone: "red" });
  if (view?.notApplicable || (item.disposition === "na" && !view?.notApplicable)) out.push({ text: "Not needed here", tone: "muted" });
  else if (view?.notDecided) {
    const reason = UNRESOLVED_REASONS[view.reason]?.label;
    out.push({ text: ["Not decided yet", reason, item.responsibility && RESPONSIBILITIES[item.responsibility]].filter(Boolean).join(" · "), tone: "amber" });
  }
  if (config?.dispositionUse === "settled_only" && SETTLED.has(item.disposition)) out.push({ text: dispositionLabel(item.disposition), tone: "muted" });
  if (item.sync?.status === "in_review") out.push({ text: "The client chose on the portal — see Product details", tone: "amber" });
  if (item.sync?.status === "changes_requested") out.push({ text: "The client asked for a change — see Product details", tone: "amber" });
  const product = [[item.manufacturer, item.product, item.model].filter(Boolean).join(" "), item.colour].filter(Boolean).join(" · ");
  if (product) out.push({ text: product, tone: "muted" });
  const s = item.id && saveState ? saveState(item.id) : null;
  if (s === "rejected" || s === "conflict") out.push({ text: "Not saved — see the note at the top", tone: "red" });
  return out;
}
const TONE = { muted: "text-muted", amber: "text-amber-800", red: "text-red-700" };

/**
 * One choice. item: the record, or null for a question not answered yet (seed creates it on the first tap).
 * Optional: rowTitle (a zone or element name), fixedZone, usedZones, coveredQuestions, areaOptions (as on PromptRow).
 */
export default function ChoiceRow({
  reg, context, question, item, seed, room, upsertItem, updateItem, deleteItem, readOnly, saveState, actor, onPortalItem,
  rowTitle, fixedZone, usedZones, coveredQuestions, areaOptions,
}) {
  const narrow = useNarrow();
  const menuBtn = useRef(null);
  const press = useRef(null);
  const [menu, setMenu] = useState(null);        // null | "menu" | "remove"
  const [details, setDetails] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const it = item || makeItem(seed);
  const qid = question?.id || null;
  const config = configForRow(qid, it);
  const guided = isGuidedConfig(config) && answerIsEditable(it.answer);
  const locked = !!it.sync?.locked;
  const disabled = !!readOnly || locked;
  const patch = (partial) => (item ? updateItem(item.id, partial) : upsertItem(seed, partial));
  const write = (next) => patch(itemPatch(it, config, next));
  const view = guided ? choiceView(config, it.answer, { showDetail: true, usedZones, coveredQuestions }) : null;
  const title = rowTitle || config?.linkedLabel || question?.short || labelOf(it) || "Item";
  const status = statusOf(it, view, config, qid, saveState);
  const isAction = it.itemKind === "action";
  const legacyNa = it.disposition === "na" && !view?.notApplicable;
  const showNote = guided && (noteOpen || !!view?.note);
  const close = () => setMenu(null);
  const pick = (fn) => () => { fn(); close(); };
  const roomName = room?.name ? ` in ${room.name}` : "";
  const startPress = () => { clearTimeout(press.current); press.current = setTimeout(() => setHelp(true), 500); };
  const endPress = () => clearTimeout(press.current);

  return (
    <div className="border-t border-hairline px-4 py-3 first:border-t-0" data-testid={`choice-row-${qid || it.id}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
        <div className="min-w-0 pt-2.5">
          <p className="text-[15px] font-bold leading-5 text-ink sm:text-sm" title={question?.text || undefined}
            onTouchStart={startPress} onTouchEnd={endPress} onTouchMove={endPress} onContextMenu={(e) => { if (question?.text) { e.preventDefault(); setHelp((h) => !h); } }}>
            {title}
          </p>
          {help && question?.text && <p className="mt-0.5 text-[13px] leading-snug text-muted">{question.text} <button type="button" className="font-bold text-primary" onClick={() => setHelp(false)}>Hide</button></p>}
          {status.length > 0 && (
            <p className="mt-0.5 text-[13px] leading-snug">
              {status.slice(0, 3).map((s, i) => <span key={i} className={TONE[s.tone]}>{i ? " · " : ""}{s.text}</span>)}
            </p>
          )}
        </div>
        <div className="relative -mr-2 flex items-start gap-1">
          <NeedsActionFlag reg={reg} context={context} item={item || null} seed={seed} updateItem={updateItem} upsertItem={upsertItem} readOnly={readOnly} />
          <IconButton label={`More for ${title}`} buttonRef={menuBtn} expanded={!!menu} onClick={() => setMenu((m) => (m ? null : "menu"))} />
          <Popover open={!!menu} onClose={close} narrow={narrow} anchorRef={menuBtn} title={narrow ? title : undefined}>
            {menu === "remove" ? (
              <Confirm text={`Remove this answer${roomName}? It comes off the register.`} confirmLabel="Remove answer"
                onConfirm={() => { deleteItem(item.id); close(); }} onCancel={close} />
            ) : (
              <div role="menu">
                {guided && !isAction && !disabled && <MenuItem checked={view.notDecided} onClick={pick(() => write(toggleNotDecided(config, it.answer)))}>Not decided yet</MenuItem>}
                {guided && !isAction && !disabled && !view.ownNotApplicable && (
                  <MenuItem checked={view.notApplicable || legacyNa} onClick={pick(() => (legacyNa ? patch({ disposition: "undecided" }) : write(toggleNotApplicable(config, it.answer))))}>Not needed here</MenuItem>
                )}
                {guided && !disabled && settleOptions(config, { showDetail: true, current: it.disposition }).map(([d, label]) => (
                  <MenuItem key={d} checked={it.disposition === d} onClick={pick(() => patch(settlePatch(it, config, d)))}>{label}</MenuItem>
                ))}
                {guided && !readOnly && <MenuItem onClick={pick(() => setNoteOpen(true))}>Note for the office (doesn&apos;t print)</MenuItem>}
                <MenuItem onClick={pick(() => setDetails(true))}>Product details…</MenuItem>
                {item && deleteItem && !readOnly && !locked && <><MenuDivider /><MenuItem danger onClick={() => setMenu("remove")}>Remove answer</MenuItem></>}
              </div>
            )}
          </Popover>
        </div>
      </div>

      <div className="mt-2">
        {guided ? (
          <ChoiceChips qid={qid} config={config} item={it} disabled={disabled} onPatch={patch} usedZones={usedZones} coveredQuestions={coveredQuestions} fixedZone={fixedZone} areaOptions={areaOptions} />
        ) : (
          <DraftInput value={it.description} onCommit={(v) => patch({ description: v })} disabled={disabled} placeholder="Say what…" aria-label={title} className={inputCls} />
        )}
      </div>

      {showNote && (
        <label className="mt-2 block text-xs text-muted">Note for the office (doesn&apos;t print)
          <DraftInput value={view.note} disabled={readOnly} onCommit={(v) => write(setAnswerNote(config, it.answer, v))} placeholder="Short note, staff only…" className={`${inputCls} mt-1`} />
        </label>
      )}

      {details && (narrow ? (
        <Popover open narrow onClose={() => setDetails(false)} title={`${title}: product details`}>
          <div className="pb-2"><DetailRow {...{ question, item, seed, actor, readOnly, saveState, patch, deleteItem, onPortalItem, fixedZone, usedZones, areaOptions, coveredQuestions }} /></div>
        </Popover>
      ) : (
        <div className="mt-2 rounded-lg border border-hairline bg-page p-2" data-testid={`details-${qid || it.id}`}>
          <div className="flex items-center justify-between px-1 pb-1">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Product details</p>
            <button type="button" onClick={() => setDetails(false)} className={textBtn}>Close</button>
          </div>
          <DetailRow {...{ question, item, seed, actor, readOnly, saveState, patch, deleteItem, onPortalItem, fixedZone, usedZones, areaOptions, coveredQuestions }} />
        </div>
      ))}
    </div>
  );
}

/** The full record (PromptRow): office fields, approvals with their evidence, the client portal. */
function DetailRow({ question, item, seed, actor, readOnly, saveState, patch, deleteItem, onPortalItem, fixedZone, usedZones, areaOptions, coveredQuestions }) {
  return (
    <PromptRow question={question} item={item} seed={seed} actor={actor} readOnlyReason={readOnly ? "Read-only" : null} saveState={saveState} actionFlag={false}
      onChange={patch} onDelete={item && deleteItem && !readOnly ? () => deleteItem(item.id) : null}
      onPortal={item && onPortalItem ? (action, ev) => onPortalItem(item, action, ev) : null}
      fixedZone={fixedZone} usedZones={usedZones} areaOptions={areaOptions} coveredQuestions={coveredQuestions} />
  );
}

/**
 * One row per record for a question that repeats. A blank row isn't saved until something is answered; a used id is
 * never offered again, so a removed row stays removed (the RepeatRows rule).
 */
export function ChoiceRepeat({ question, items, seed, readOnly, ...row }) {
  const spare = useRef(genId());
  const [added, setAdded] = useState(null);
  const saved = new Set(items.map((i) => i.id));
  if (saved.has(spare.current)) spare.current = genId();
  const openAdded = added && !saved.has(added) ? added : null;
  const blankId = openAdded || (items.length ? null : spare.current);
  const rows = [...items.map((i) => ({ id: i.id, item: i })), ...(blankId ? [{ id: blankId, item: null }] : [])];
  const short = question.short;
  return (
    <div>
      {rows.map(({ id, item }, k) => (
        <ChoiceRow key={id} question={question} item={item} seed={{ ...seed, id }} readOnly={readOnly} {...row}
          rowTitle={k ? `${short} · ${clean(item?.answer?.element?.label) || "another"}` : undefined} />
      ))}
      {!readOnly && !blankId && (
        <div className="px-4 pb-3">
          <button type="button" onClick={() => setAdded(genId())} className="focus-ring inline-flex min-h-[44px] items-center rounded-full border border-dashed border-primary px-4 text-sm font-bold text-primary hover:bg-primary/5">+ Add another</button>
        </div>
      )}
    </div>
  );
}

/**
 * K-008 appliances (spec S3): one chip per appliance. Tapping a chip creates that appliance's record, supplied by the
 * "Mostly supplied by" choice; each appliance keeps one stable id until its record exists, so a double tap or a retry
 * never makes two. Tapping a chosen chip opens Blue Leaf · Client · Others · Remove.
 */
export function ApplianceRow({ reg, context, question, items, seed, upsertItem, updateItem, deleteItem, readOnly, saveState, actor, onPortalItem, room }) {
  const narrow = useNarrow();
  const config = configForRow(question.id, makeItem(seed));
  const supplyOptions = (config?.options || []).map((o) => [o.id, o.label]);
  const [supply, setSupply] = useState(supplyOptions[0]?.[0] || "");
  const [menuFor, setMenuFor] = useState(null);
  const slots = useRef({});
  const anchors = useRef({});
  const byElement = (key) => items.find((i) => i.answer?.element?.key === key) || null;
  for (const k of Object.keys(slots.current)) if (items.some((i) => i.id === slots.current[k])) delete slots.current[k];
  const add = (el) => {
    if (!slots.current[el.id]) slots.current[el.id] = genId();
    const id = slots.current[el.id];
    const blank = makeItem({ ...seed, id });
    let answer = chooseElement(config, null, el.id);
    if (supply) answer = toggleOption(config, answer, [supply]);
    upsertItem({ ...seed, id }, itemPatch(blank, config, answer));
  };
  const setSupplyOf = (it, key) => {
    const on = (it.answer?.selected || []).some((s) => !s.stale && s.path?.[0] === key);
    if (!on) updateItem(it.id, itemPatch(it, config, toggleOption(config, it.answer, [key])));
  };
  const supplyOf = (it) => supplyOptions.find(([k]) => (it.answer?.selected || []).some((s) => !s.stale && s.path?.[0] === k))?.[1] || "";
  const loose = items.filter((i) => !i.answer?.element?.key || !(config?.elements || []).some((e) => e.id === i.answer.element.key));
  if (!config) return null;
  return (
    <div className="border-t border-hairline px-4 py-3" data-testid={`choice-row-${question.id}`}>
      <p className="pt-1 text-[15px] font-bold leading-5 text-ink sm:text-sm" title={question.text}>{question.short}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(config.elements || []).map((el) => {
          const it = byElement(el.id);
          if (!it) return <ChoiceChip key={el.id} disabled={readOnly} onClick={() => add(el)}>{el.label}</ChoiceChip>;
          const by = supplyOf(it);
          return (
            <span key={el.id} className="relative" ref={(n) => { anchors.current[el.id] = n; }}>
              <ChoiceChip on disabled={readOnly} onClick={() => setMenuFor((m) => (m === el.id ? null : el.id))} ariaLabel={`${el.label}${by ? `, ${by}` : ""}. Change`}>
                {el.label}{by && by !== supplyOptions[0]?.[1] ? <span className="font-normal"> · {by}</span> : null}
              </ChoiceChip>
              <Popover open={menuFor === el.id} onClose={() => setMenuFor(null)} narrow={narrow} anchorRef={{ current: anchors.current[el.id] }} title={el.label} align="left">
                <div role="menu">
                  {supplyOptions.map(([k, l]) => <MenuItem key={k} checked={by === l} onClick={() => { setSupplyOf(it, k); setMenuFor(null); }}>{l}</MenuItem>)}
                  <div className="flex items-center gap-2 px-2 py-1">
                    <span className="text-sm text-muted">Needs action</span>
                    <NeedsActionFlag reg={reg} context={context} item={it} seed={seed} updateItem={updateItem} upsertItem={upsertItem} readOnly={readOnly} />
                  </div>
                  <MenuDivider />
                  <MenuItem danger onClick={() => { deleteItem(it.id); setMenuFor(null); }}>Remove</MenuItem>
                </div>
              </Popover>
            </span>
          );
        })}
      </div>
      {supplyOptions.length > 0 && !readOnly && (
        <div className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className="text-xs text-muted">Mostly supplied by</span>
          <div className="sm:w-80"><Segmented full options={supplyOptions} value={supply} onChange={setSupply} label="Mostly supplied by" /></div>
        </div>
      )}
      {loose.map((it) => (
        <ChoiceRow key={it.id} reg={reg} context={context} question={question} item={it} seed={{ ...seed, id: it.id }} room={room} upsertItem={upsertItem} updateItem={updateItem}
          deleteItem={deleteItem} readOnly={readOnly} saveState={saveState} actor={actor} onPortalItem={onPortalItem} />
      ))}
    </div>
  );
}

/**
 * RoomDefaultsPanel — what this room takes from Whole House, in one compact list (Tab 27 B10, DEC-MRUX-02).
 *
 * Confirming records that these defaults apply to this room. It writes to the room only, so it can't approve, verify or
 * price anything. A default that changes after a room confirmed it is flagged here and the room is not moved on silently.
 */
import { answerSummary, roomLinesToConfirm } from "../../../../lib/register.js";
import { Chip } from "./ui.jsx";

const STATUS = {
  inherited: { label: "To confirm", tone: "slate" },
  confirmed: { label: "Confirmed for this room", tone: "green" },
  changed: { label: "Changed since confirmed", tone: "amber" },
  overridden: { label: "Different here", tone: "violet" },
};
const textBtn = "focus-ring inline-flex min-h-[40px] items-center rounded px-1 text-[11px] font-semibold text-primary hover:underline disabled:opacity-40 sm:min-h-[26px]";

const words = (def) => def.description || answerSummary(def) || def.product || "Set";

export default function RoomDefaultsPanel({ lines, onConfirm, onException, readOnly }) {
  if (!lines.length) return null;
  const toConfirm = roomLinesToConfirm(lines);
  const changed = lines.filter((l) => l.status === "changed").length;
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2.5" data-testid="room-defaults">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-xs font-semibold text-ink">From Whole House</p>
          {changed > 0 && <Chip tone="amber">{changed} changed</Chip>}
        </div>
        {toConfirm.length > 0 && !readOnly && (
          <button type="button" onClick={onConfirm} data-testid="confirm-room-defaults"
            className="focus-ring inline-flex min-h-[40px] items-center rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:opacity-90 sm:min-h-[30px]">
            Confirm room defaults ({toConfirm.length})
          </button>
        )}
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-muted">Confirming says these apply to this room. It isn&apos;t client approval or a technical check.</p>
      <ul className="mt-1.5 divide-y divide-violet-100">
        {lines.map((l) => {
          const key = `${l.question.id}${l.surface ? `-${l.surface.toLowerCase().replace(/\s+/g, "_")}` : ""}`;
          return (
            <li key={key} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1 text-[11px]" data-testid={`room-default-${key}`}>
              <span className="w-28 shrink-0 font-medium text-ink">{l.surface || l.question.short}</span>
              <span className="min-w-[8rem] flex-1 text-ink">{words(l.def)}</span>
              <Chip tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Chip>
              {!l.exception && !readOnly && <button type="button" onClick={() => onException(l)} className={textBtn} data-testid={`room-exception-${key}`}>Different here</button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

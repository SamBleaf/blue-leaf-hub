/**
 * LeadCorrespondence — the one "Client correspondence" area on every stage. Closed, it is a line saying what was
 * last recorded and one way to review the stage's email. The thread, replies and new messages open on demand.
 * The email families, the meeting booking emails and their endpoints are unchanged: StageEmailButton previews and
 * sends, LeadMailbox reads and composes. This component only decides what is offered and describes what the log holds.
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/apiFetch.js";
import {
  stageEmailTemplates, stageCorrespondenceNote, correspondenceStatus, recordedSendAt, defaultStageTemplate,
  isSendingOff, templateBlockedReason, templateSendOptions, templateSendPath, patchAfterStageEmail, formatCorrespondenceDate,
} from "../../../lib/leadCorrespondence.js";
import { CHOOSE_STAGE_EMAIL, STAGE_EMAIL_TARGET } from "../../../lib/leadNextAction.js";
import StageEmailButton from "./StageEmailButton.jsx";
import LeadMailbox from "./LeadMailbox.jsx";

export default function LeadCorrespondence({ lead, patch, reload }) {
  const [box, setBox] = useState({ loading: true, loadFailed: false, columnMissing: false, messages: [], sending: null });
  const [threadOpen, setThreadOpen] = useState(false);
  const [pickedKey, setPickedKey] = useState(null);

  const loadBox = useCallback(async () => {
    const { ok, data } = await apiFetch(`/api/sales/leads/${lead.id}/mailbox`);
    if (ok) setBox({ loading: false, loadFailed: false, columnMissing: !!data?.columnMissing, messages: data?.messages || [], sending: data?.sending || null });
    else setBox((b) => ({ ...b, loading: false, loadFailed: true }));
  }, [lead.id]);
  useEffect(() => { loadBox(); }, [loadBox]);

  // A meeting card's "Go to the booking email" picks that meeting's email in the list here.
  useEffect(() => {
    const choose = (e) => setPickedKey(e.detail);
    document.addEventListener(CHOOSE_STAGE_EMAIL, choose);
    return () => document.removeEventListener(CHOOSE_STAGE_EMAIL, choose);
  }, []);

  const templates = stageEmailTemplates(lead.stage, lead);
  const selected = templates.find((t) => t.key === pickedKey) || defaultStageTemplate(templates, box.messages, lead);
  const status = correspondenceStatus(box);
  const stageNote = stageCorrespondenceNote(lead.stage, lead);
  const selectedSentAt = selected ? recordedSendAt(selected, box.messages, lead) : null;
  const selectedOff = selected ? isSendingOff(selected.flag, box.sending) : false;
  const blockedReason = selected ? templateBlockedReason(selected, lead) : null;

  async function handleSent(template) {
    setPickedKey(template.key);
    const update = patchAfterStageEmail(lead, template.key, new Date().toISOString().slice(0, 10));
    if (update) await patch(update);
    await Promise.all([loadBox(), reload?.()]);
  }

  const canOpenThread = !box.columnMissing && !box.loadFailed;
  const count = box.messages.length;

  return (
    <div className="rounded-card border border-hairline bg-surface p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="section-label">Client correspondence</h3>
        {canOpenThread && (
          <button type="button" aria-expanded={threadOpen} onClick={() => setThreadOpen((o) => !o)} className="text-xs font-semibold text-primary hover:underline">
            {threadOpen ? "Hide correspondence" : `View correspondence${count ? ` (${count})` : ""}`}
          </button>
        )}
      </div>

      <div>
        <p className="truncate text-sm text-ink" title={status.line}>{status.line}</p>
        {status.detail && <p className="text-[11px] text-muted">{status.detail}</p>}
      </div>

      {stageNote && <p className="text-xs text-muted">{stageNote}</p>}

      {selected && (
        <div data-next-target={STAGE_EMAIL_TARGET} className="flex flex-wrap items-center gap-2 rounded-lg transition-shadow">
          {templates.length > 1 && (
            <select aria-label="Choose the email to review" value={selected.key} onChange={(e) => setPickedKey(e.target.value)}
              className="min-w-0 max-w-full flex-1 rounded-lg border border-hairline bg-page px-2 py-1.5 text-sm text-ink focus-ring">
              {templates.map((t) => {
                const sentAt = recordedSendAt(t, box.messages, lead);
                return <option key={t.key} value={t.key}>{t.label}{sentAt ? ` (sent ${formatCorrespondenceDate(sentAt)})` : ""}</option>;
              })}
            </select>
          )}
          <StageEmailButton key={selected.key} lead={lead} sendPath={templateSendPath(selected)} which={selected.which}
            label={templates.length > 1 ? "Review email" : `Review ${selected.label.charAt(0).toLowerCase()}${selected.label.slice(1)}`}
            title={selected.label} note={selected.note} defaultsAt={selected.defaultsAt}
            options={templateSendOptions(selected, lead)} disabledReason={blockedReason} sendingOff={selectedOff}
            onSent={() => handleSent(selected)} />
        </div>
      )}

      {selected && selectedSentAt && <p className="text-[11px] text-muted">This email was last recorded as sent {formatCorrespondenceDate(selectedSentAt)}.</p>}
      {selected && selectedOff && <p className="text-[11px] font-medium text-amber-700">Sending is turned off for this email, so you can preview it but it won&apos;t go out.</p>}

      {threadOpen && canOpenThread && (
        <LeadMailbox lead={lead} messages={box.messages} loading={box.loading} sendingOff={isSendingOff("mailbox", box.sending)} onSent={loadBox} />
      )}
    </div>
  );
}

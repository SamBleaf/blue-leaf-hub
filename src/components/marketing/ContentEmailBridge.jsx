/**
 * ContentEmailBridge.jsx
 *
 * Modal that bridges a marketing content item into an email send.
 * Flow: content item → pre-fill subject/body → pick mailing list → save draft
 * The actual "Send" is a human-triggered confirm step — this file never calls
 * POST /api/crm/sends/:sid/send automatically.
 *
 * Opens/clicks analytics are surfaced in the SendsHistory sub-component below.
 */

import { useState, useEffect } from "react";
import { apiFetch, apiPost } from "../../lib/apiFetch.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildDefaultSubject(item) {
  if (item.title) return item.title;
  if (item.topic) return item.topic;
  return "";
}

function buildDefaultHtml(item) {
  const parts = [];
  if (item.body) parts.push(`<p>${item.body.replace(/\n/g, "</p><p>")}</p>`);
  if (item.cta) parts.push(`<p><strong>${item.cta}</strong></p>`);
  return parts.join("\n");
}

const SEND_STATUS_COLOURS = {
  draft:     "bg-slate-100 text-slate-600",
  scheduled: "bg-amber-100 text-amber-700",
  sending:   "bg-blue-100 text-blue-700",
  sent:      "bg-emerald-100 text-emerald-700",
  failed:    "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

// ─── SendsHistory — analytics loopback ───────────────────────────────────────

/**
 * Surfaces opens/clicked counts for sends linked to this content item.
 * Rendered inside the ItemDetail panel so the marketing→email→analytics
 * loop is visible without navigating away.
 */
export function ContentItemSendsHistory({ contentItemId }) {
  const [sends, setSends] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contentItemId) return;
    setLoading(true);
    apiFetch(`/api/crm/sends?contentItemId=${encodeURIComponent(contentItemId)}&limit=10`)
      .then(({ ok, data }) => {
        if (ok) setSends(data.sends || []);
      })
      .finally(() => setLoading(false));
  }, [contentItemId]);

  if (loading) {
    return (
      <p className="text-xs text-muted py-2">Loading email history…</p>
    );
  }

  if (sends.length === 0) {
    return (
      <p className="text-xs text-muted py-2">No emails sent from this content item yet.</p>
    );
  }

  return (
    <div className="space-y-2">
      {sends.map((s) => (
        <div key={s.id} className="flex items-start justify-between gap-2 text-xs">
          <div className="flex-1 min-w-0">
            <p className="text-ink font-medium truncate">{s.subject}</p>
            <p className="text-muted">
              {s.sentAt
                ? new Date(s.sentAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
                : s.scheduledAt
                ? `Scheduled ${new Date(s.scheduledAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`
                : "Draft"}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {s.status === "sent" && (
              <>
                <span className="text-muted" title="Opens">
                  <span className="font-semibold text-ink">{s.openedCount ?? 0}</span> opens
                </span>
                <span className="text-muted" title="Clicks">
                  <span className="font-semibold text-ink">{s.clickedCount ?? 0}</span> clicks
                </span>
              </>
            )}
            <span className={`px-2 py-0.5 rounded-full font-semibold ${SEND_STATUS_COLOURS[s.status] || "bg-slate-100 text-slate-600"}`}>
              {s.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── ContentEmailBridgeModal ──────────────────────────────────────────────────

/**
 * Props:
 *   item       — marketing_content_items row (camelCase from API)
 *   onClose    — called when modal is dismissed
 *   onDraftSaved(send) — called when a draft is created; send = the created email_send row
 */
export default function ContentEmailBridgeModal({ item, onClose, onDraftSaved }) {
  const [lists, setLists] = useState([]);
  const [listsLoading, setListsLoading] = useState(true);

  const [mailingListId, setMailingListId] = useState("");
  const [subject, setSubject] = useState(buildDefaultSubject(item));
  const [previewText, setPreviewText] = useState("");
  const [htmlBody, setHtmlBody] = useState(buildDefaultHtml(item));
  const [scheduledAt, setScheduledAt] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createdSend, setCreatedSend] = useState(null);

  // Load mailing lists on mount
  useEffect(() => {
    apiFetch("/api/crm/lists")
      .then(({ ok, data }) => {
        if (ok) setLists(data.lists || []);
      })
      .finally(() => setListsLoading(false));
  }, []);

  const selectedList = lists.find((l) => l.id === mailingListId);
  const recipientCount = selectedList?.activeMembers ?? selectedList?.totalMembers ?? "?";

  async function saveDraft() {
    setError("");
    if (!mailingListId) { setError("Please select a mailing list."); return; }
    if (!subject.trim()) { setError("Subject is required."); return; }

    setSaving(true);
    const { ok, data, error: e } = await apiPost("/api/crm/sends", {
      mailingListId,
      subject: subject.trim(),
      previewText: previewText.trim() || null,
      htmlBody: htmlBody.trim() || null,
      contentItemId: item.id,
      campaignId: item.campaignId || item.campaign_id || null,
      scheduledAt: scheduledAt || null,
    });
    setSaving(false);

    if (!ok) {
      setError(e || "Failed to save draft. Try again.");
      return;
    }

    const send = data.send;
    setCreatedSend(send);
    onDraftSaved?.(send);
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (createdSend) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-ink">Draft saved</h3>
            <button type="button" onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">×</button>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-1">
            <p className="text-sm font-medium text-emerald-800">{createdSend.subject}</p>
            <p className="text-xs text-emerald-700">
              Status: <strong>{createdSend.status}</strong>
              {createdSend.scheduledAt ? ` · Scheduled for ${new Date(createdSend.scheduledAt).toLocaleString("en-AU")}` : ""}
            </p>
          </div>

          <p className="text-sm text-muted">
            The email draft has been created and linked to this content item.
            To send it, go to the <strong>CRM → Mailing Lists</strong> section and open the sends list,
            then click <strong>Send →</strong>.
          </p>

          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">Before sending, confirm:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>The subject line and body are correct</li>
              <li>The mailing list is the right audience</li>
              <li>Scheduled date/time (if set) is correct</li>
              <li>This will email <strong>{recipientCount}</strong> recipient{recipientCount !== 1 ? "s" : ""}</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ── Compose form ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-hairline flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-ink">Send as email</h3>
            <p className="text-xs text-muted mt-0.5 truncate max-w-xs">
              From: <em>{item.title || item.topic || "this content item"}</em>
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">×</button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Mailing list */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Mailing list <span className="text-red-500">*</span>
            </label>
            {listsLoading ? (
              <p className="text-xs text-muted">Loading lists…</p>
            ) : (
              <select
                value={mailingListId}
                onChange={(e) => setMailingListId(e.target.value)}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                <option value="">Select a list…</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {(l.activeMembers != null || l.totalMembers != null)
                      ? ` (${l.activeMembers ?? l.totalMembers} recipients)`
                      : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Subject <span className="text-red-500">*</span>
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. 5 things to know before your slab pour"
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* Preview text */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Preview text <span className="text-muted font-normal">(shows in inbox before opening)</span>
            </label>
            <input
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="Short teaser shown in email client…"
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* HTML body */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Email body (HTML)
            </label>
            <textarea
              value={htmlBody}
              onChange={(e) => setHtmlBody(e.target.value)}
              rows={8}
              placeholder="<p>Your email content here…</p>"
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary leading-relaxed"
            />
            <p className="text-xs text-muted mt-1">
              Pre-filled from the content item body. Unsubscribe footer is added automatically.
            </p>
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Schedule <span className="text-muted font-normal">(leave blank to save as draft)</span>
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* Linked context */}
          {(item.campaignId || item.campaign_id) && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700">
              This send will be linked to the campaign attached to this content item.
            </div>
          )}

          {/* Recipient count preview */}
          {selectedList && (
            <div className="rounded-lg bg-page border border-hairline px-3 py-2 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-green-600">&#10003;</span>
                <span className="text-muted">
                  <strong className="text-ink">{recipientCount}</strong> active recipient{recipientCount !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-600">&#10003;</span>
                <span className="text-muted">Unsubscribe link included (Spam Act compliant)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-600">&#10003;</span>
                <span className="text-muted">Linked to content item for analytics tracking</span>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-hairline flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted hover:text-ink transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={saveDraft}
            disabled={saving || !subject.trim() || !mailingListId}
            className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving draft…" : scheduledAt ? "Schedule draft →" : "Save draft →"}
          </button>
        </div>
      </div>
    </div>
  );
}

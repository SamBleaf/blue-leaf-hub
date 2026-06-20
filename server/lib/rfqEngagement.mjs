/**
 * rfqEngagement.mjs — per-trade RFQ engagement tracking (webhook-driven).
 *
 * Records Resend delivery events (delivered / opened / clicked / bounced / complained) against the
 * RFQ they belong to. The RFQ is matched to a Resend event via rfqs.resend_email_id, which is
 * captured at send time (see captureResendId + the three send paths). No email body is modified.
 *
 * Two writes per event:
 *   1. rfq_events — append-only log, one row per event. Idempotent: a UNIQUE (rfq_id, event_type,
 *      source_event_id) index makes a Resend retry a no-op (unique violation is swallowed).
 *   2. rfqs.* — denormalised first-touch timestamps so the Tender Board renders the engagement
 *      strip with no join. First-touch columns are only set when currently NULL (`is null` guard),
 *      so a later duplicate event never overwrites the original time. `last_event` always updates.
 */

// Resend event-type → the rfqs column that records its FIRST occurrence. Columns are only written
// when currently NULL so the earliest event wins (first-touch semantics).
const FIRST_TOUCH_COLUMN = {
  delivered: "email_delivered_at",
  opened: "email_opened_at",
  clicked: "email_clicked_at",
  bounced: "bounced_at",
};

/**
 * Persist the Resend message id onto an rfqs row so the webhook can later match events to it.
 * Best-effort: a failure here only means engagement won't be tracked for that send — never throw
 * into a live send path.
 */
export async function captureResendId(sb, rfqId, id) {
  if (!sb || !rfqId || !id) return;
  try {
    await sb.from("rfqs").update({ resend_email_id: String(id) }).eq("id", rfqId);
  } catch (e) {
    console.warn("[rfqEngagement] captureResendId failed:", e?.message || e);
  }
}

/**
 * Record one Resend engagement event for an RFQ.
 *   recordRfqEvent(sb, { rfqId, eventType, sourceEventId, occurredAt, meta })
 *     - eventType: normalised Resend type without the "email." prefix
 *       (delivered | opened | clicked | bounced | complained).
 *     - sourceEventId: a stable id from the payload for idempotent de-duplication.
 *     - meta: arbitrary jsonb (e.g. the clicked link, bounce reason).
 * Best-effort and idempotent — never throws into the webhook handler.
 */
export async function recordRfqEvent(sb, { rfqId, eventType, sourceEventId, occurredAt, meta }) {
  if (!sb || !rfqId || !eventType) return;
  const when = occurredAt || new Date().toISOString();
  const metaObj = meta && typeof meta === "object" ? meta : {};

  // 1) Append to the event log. A unique-violation (code 23505) means we've already logged this
  //    exact event — that's the idempotent path, so swallow it.
  try {
    const { error } = await sb.from("rfq_events").insert({
      rfq_id: rfqId,
      event_type: eventType,
      source_event_id: sourceEventId || null,
      occurred_at: when,
      meta: metaObj,
    });
    if (error && error.code !== "23505") {
      console.warn("[rfqEngagement] rfq_events insert:", error.message || error);
    }
  } catch (e) {
    console.warn("[rfqEngagement] rfq_events insert threw:", e?.message || e);
  }

  // 2) Patch the denormalised rfqs columns. last_event always updates; first-touch timestamps are
  //    only written when currently NULL.
  try {
    // Always-set fields (idempotent — last_event/suppressed reflect the most authoritative state).
    const always = { last_event: eventType };
    if (eventType === "bounced" || eventType === "complained") always.suppressed = true;
    await sb.from("rfqs").update(always).eq("id", rfqId);

    // First-touch timestamp for this event type, only when not already set.
    const col = FIRST_TOUCH_COLUMN[eventType];
    if (col) {
      await sb.from("rfqs").update({ [col]: when }).eq("id", rfqId).is(col, null);
    }

    // A click on the docs link ("dropbox" in the URL) also stamps docs_viewed_at (first-touch).
    if (eventType === "clicked") {
      const link = String(metaObj.link || metaObj.url || "").toLowerCase();
      if (link.includes("dropbox")) {
        await sb.from("rfqs").update({ docs_viewed_at: when }).eq("id", rfqId).is("docs_viewed_at", null);
      }
    }
  } catch (e) {
    console.warn("[rfqEngagement] rfqs denorm update:", e?.message || e);
  }
}

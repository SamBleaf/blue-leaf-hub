---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: AI Drafts (Supplier Email, Selection Reminder, Reply Summary)

**Module:** Procurement
**SOP ID:** 16-09
**Status:** Draft
**Priority:** Medium

---

## 1. Who uses this

Admin, Supervisor

---

## 2. When to use it

When you want a head-start on procurement comms: a supplier RFQ/order email, a client-safe selection reminder, a summary of a supplier's reply, or a weekly "what to order" digest.

---

## 3. What this does

The Hub **drafts** text for you using AI. It **never sends anything and never places an order** — every draft opens in a modal for you to review, copy, and send yourself via the client portal or your email.

- **Order/RFQ email** (Register row ✉) — drafts an email to the item's supplier.
- **Selection reminder** (Selections tab) — drafts a friendly, client-safe reminder for an unmade selection.
- **Reply summary** — paste a supplier's reply; get a 2-3 line summary + extracted price/lead time.
- **Weekly digest** — a short summary of what's overdue/due/blocked across all jobs.

If the AI key isn't configured, you still get a sensible deterministic draft.

---

## 4. Before you start

- Admin or Supervisor role.
- `ANTHROPIC_API_KEY` configured (optional — without it you get template fallbacks).

---

## 5. Step-by-step process

1. **Order email:** Register → a builder-supplied item → click **✉**. Review the draft, **Copy**, send from your email.
2. **Selection reminder:** Selections tab → **Draft reminder** on a blocked item. Review, copy, send via the client portal.
3. **Reply summary:** (API/where surfaced) paste the supplier reply → get summary + price + lead time.
4. **Weekly digest:** review the digest summary of order-by overdue/due/blocked.

> ⚠️ **Always review before sending.** AI can mis-read; you are the send button. The Hub never auto-sends or auto-orders.

[insert screenshot: AI draft modal with Copy button + draft-only notice]

---

## 6. What happens next

Nothing is sent automatically. You copy the draft and send it yourself, keeping full control of every supplier and client communication.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Expecting it to send | It's draft-only by design | Copy + send yourself |
| Sending without reading | Over-trusting AI | Always review; check prices/dates |
| ✉ missing on a row | Item isn't builder-supplied or has no supplier | Set a supplier; subbie/client items aren't ordered by us |

---

## 8. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Draft is generic/templated | AI key not configured | Add `ANTHROPIC_API_KEY` (fallback still works) |
| "Set a supplier first" | No supplier on the item | Assign a supplier in the Register |

---

## 9. Related SOPs

- 16-05: Clear a Selection Blocker
- 16-06: Request a Quote and Track to Delivered
- 16-07: Manage Suppliers

---

## 10. Screenshot placeholders

[insert screenshot: Order email draft modal showing subject, body, Copy button, and "never auto-sends" notice]
[insert screenshot: Selection reminder draft modal with client-safe reminder text and Copy button]

---

## 11. Automation notes

- **Supplier email draft:** `POST /api/procurement/ai/supplier-email` — returns `{ draft: { subject, body, sent: false } }`. No email is sent; no order is placed.
- **Selection reminder draft:** `POST /api/procurement/items/:id/ai/selection-reminder` — returns draft text. No email sent.
- **Reply summary:** `POST /api/procurement/ai/summarise-reply` — returns `{ result: { summary, priceExGst, leadDays } }`. No writes.
- **Weekly digest:** `GET /api/procurement/ai/weekly-digest` — returns a text summary of overdue/due/blocked items. No writes or sends.
- **Graceful degradation:** If `ANTHROPIC_API_KEY` is not set, the service returns a deterministic template draft with `aiConfigured: false`.
- No emails, no POs, no DB writes to any procurement table from any AI endpoint.

---

## 12. Edge cases and limits

- The ✉ (order email) icon only appears on builder-supplied items with a supplier set. Subbie/client/PC-supplied items are not ordered by Blue Leaf.
- If `ANTHROPIC_API_KEY` is misconfigured, the AI call may timeout — the server catches this and returns the fallback draft.
- Reply summary cannot guarantee extraction of price/lead time from all supplier formats — always verify the extracted values.
- Weekly digest only covers jobs with generated registers; jobs without registers are silently excluded.
- Employee role returns 403 on all `/api/procurement/ai/*` endpoints.

---

## 13. Owner of the process

Admin / Supervisor  
Next review date: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

**Test environment:** Local dev (`npm run dev`). Migrations 085 applied.

### TC-01 — Order email draft (draft-only)
**Action:** Register → builder-supplied item with a supplier → ✉.
**Expected:** `POST /api/procurement/ai/supplier-email` returns `{ draft: { subject, body, sent:false } }`; modal shows draft + "never auto-sends" notice.
**Pass criteria:** No email sent (no network send); copyable.

### TC-02 — Selection reminder draft
**Action:** Selections → Draft reminder.
**Expected:** `POST /api/procurement/items/:id/ai/selection-reminder` returns a draft; modal opens.
**Pass criteria:** Nothing sent.

### TC-03 — Reply summary
**Action:** `POST /api/procurement/ai/summarise-reply` with sample reply text.
**Expected:** `{ result: { summary, priceExGst, leadDays } }`.
**Pass criteria:** Valid JSON; no crash on unparseable AI output (fallback).

### TC-04 — Role gate
**Action:** Call any `/ai/*` endpoint as employee.
**Expected:** 403.
**Pass criteria:** Blocked.

### TC-05 — Graceful degradation
**Action:** Unset `ANTHROPIC_API_KEY`; request an order email.
**Expected:** A deterministic fallback draft returns (no throw).
**Pass criteria:** `aiConfigured:false`; usable draft returned.

### TC-06 — Never auto-sends/orders (feature test)
**Action:** Inspect procurementAiService.mjs.
**Expected:** No `notifyMail`/send import; no PO/commitment writes — only returns text/JSON.
**Pass criteria:** Confirmed draft-only.

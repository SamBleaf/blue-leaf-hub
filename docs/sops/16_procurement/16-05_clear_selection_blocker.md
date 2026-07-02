---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Clear a Selection Blocker

**Module:** Procurement
**SOP ID:** 16-05
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin, Supervisor

---

## 2. When to use it

When an item can't be ordered because a client or architect selection (colour, finish, tile, tapware, appliance, etc.) hasn't been made — and the order-by date is approaching.

---

## 3. What this does

The Selections tab lists every procurement item that needs a decision and isn't yet confirmed, joined to the client-portal decision record (`portal_decisions`) so you can see the decision's title, status, and due date. You can draft a reminder for the client/architect and, once the choice is made, mark the selection confirmed — which clears the blocker and lets the item's risk return to normal.

**Sending is never automatic.** The Hub drafts the reminder text; you send it via the client portal or your email. This keeps the client relationship in your hands.

---

## 4. Before you start

- Admin or Supervisor role.
- Items that need a selection are flagged `selection_required` (the master template sets this for colour/finish items).

---

## 5. Step-by-step process

1. Operations → Procurement → **Selections**.
2. (Optional) Filter to one job via the dropdown.
3. Each row shows the item, its linked decision (if any), and the order-by date with days remaining.
4. **Draft reminder** — opens a drafted message you can copy into the client portal or an email. Review and send it yourself.
5. When the client confirms, press **Mark confirmed** — the selection clears and the item's risk recomputes.
6. **Open →** jumps to the item in the Register.

> 💡 **Tip:** A selection blocker within 14 days of order-by shows the item as **Blocked** in red. Clear it before it forces the order late.

[insert screenshot: Selections list with Draft reminder and Mark confirmed]

---

## 6. What happens next

Confirming a selection removes the blocker. If the item was only held by the selection, its risk drops back to the normal order-by-based level.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Expecting the Hub to email the client | It never auto-sends | Use the drafted text and send via portal/email yourself |
| Marking confirmed before the client decided | Pressure to clear the list | Only confirm once the choice is genuinely made |
| No decision linked | The portal decision wasn't created | Create the decision in the client portal, then link it on the item |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| Selections list empty but items need choices | Items not flagged `selection_required` | Edit the item to require a selection, or fix the template |
| Decision shows "No portal decision linked" | `selection_decision_id` not set | Link the portal decision on the item |

---

## 9. Related SOPs

- 16-04: Triage the Command Centre
- 16-03: Manage the Procurement Register
- 11-05: Client Portal — Decisions (selections/variations)

---

## 10. Screenshot placeholders

[insert screenshot: Selections tab showing list of blockers with item, linked decision, order-by date, and risk pill]
[insert screenshot: Draft reminder modal with copyable text and "never auto-sends" notice]
[insert screenshot: Mark confirmed action and the item disappearing from the list]

---

## 11. Automation notes

- **Draft reminder:** `POST /api/procurement/items/:id/ai/selection-reminder` — returns draft text only; **no email is sent**.
- **Mark confirmed:** `PATCH /api/procurement/items/:id` with `selection_status: "confirmed"` — the item's risk recomputes immediately; it leaves the Selections list on reload.
- No notifications are auto-sent to the client. The draft is for your manual use.
- If `ANTHROPIC_API_KEY` is not configured, a deterministic template reminder is returned instead of an AI draft.

---

## 12. Edge cases and limits

- An item only appears in Selections if `selection_required = true` AND `selection_status != "confirmed"`.
- If no portal decision is linked (`selection_decision_id` is null), the row shows "No portal decision linked" — the blocker can still be manually confirmed.
- Marking confirmed when the client hasn't actually decided is a user error — the system does not validate the decision's actual status.
- A blocker within 14 days of its order-by date shows the **Blocked** (red) risk pill in both Selections and the Command Centre.
- Filtering by job sends `?jobId=` to `GET /api/procurement/selections/blockers`; the default (no filter) shows all jobs.

---

## 13. Owner of the process

Admin / Supervisor  
Next review date: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

**Test environment:** Local dev (`npm run dev`). Migrations 085 + 091 applied; a job with at least one `selection_required` item.

### TC-01 — Selections list loads

**Action:** Open the Selections tab.
**Expected:** `GET /api/procurement/selections/blockers` returns `{ ok: true, blockers: [...] }`.
**Pass criteria:** `ok: true`; only items with `selectionRequired` and not confirmed appear.

---

### TC-02 — Job filter

**Action:** Pick a job in the dropdown.
**Expected:** Request includes `?jobId=`; only that job's blockers show.
**Pass criteria:** Filtered correctly.

---

### TC-03 — Linked decision surfaces

**Action:** On an item with `selection_decision_id` set, view the row.
**Expected:** The row shows the decision title and status from `portal_decisions`.
**Pass criteria:** Decision detail present.

---

### TC-04 — Mark confirmed clears the blocker

**Action:** Press "Mark confirmed" on a blocker.
**Expected:** `PATCH /api/procurement/items/:id` with `selection_status: "confirmed"`; the row leaves the list on reload.
**Pass criteria:** Item gone from blockers; risk no longer "blocked".

---

### TC-05 — Reminder is draft-only (safety)

**Action:** Press "Draft reminder".
**Expected:** A draft is shown; **no email is sent** and no send endpoint is called.
**Pass criteria:** No network send; text is copyable.

---

### TC-06 — Near-order-by blocker is critical (feature test)

**Action:** Set a `selection_required`, unconfirmed item's order-by within 14 days.
**Expected:** Its risk is **Blocked** and it appears in the Command Centre selection blockers section.
**Pass criteria:** Risk = blocked in both Selections and Command Centre.

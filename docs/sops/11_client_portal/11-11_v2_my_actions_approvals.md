---
sop_version: 1.0
last_reviewed: 2026-06-21
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP 11-11: My Actions & Approvals (Portal v2.0)

**Module:** Client Portal v2.0  
**SOP ID:** 11-11  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
The **client** (logged in), to act on decisions the builder needs from them. Admin and Supervisor use this SOP to understand what the client sees and to verify their responses arrive.

## 2. When to use it
Whenever the builder needs a decision from the client: approve or decline a variation, confirm or decline a meeting, notify that a progress payment has been made, or make a selection (finish/fixture choice). All of these gather on the client's **My Actions** tab as a single decision feed.

## 3. What this does
Gives the client one place to see and clear every outstanding decision. Each action is a card. The client opens a card, reads the detail (including the builder's reasoning where provided), and responds. The builder is notified of the response and the action clears from the feed. This replaces phone-tag and lost emails with a recorded, account-based decision trail.

## 4. Before you start
- The client has logged in (SOP 11-10) and portal v2 is enabled for the project (SOP 11-12)
- There is at least one open action — these are created by the builder (variation, meeting, selection) or by the finance/sync hooks (variation issued, claim issued)
- The client must be **logged in** — these are contractual writes and are blocked for anonymous/legacy-token callers

## 5. Step-by-step process

1. Log in to the portal and open the **My Actions** tab
2. The page shows two groups: **open** actions (need a response) and **completed** actions (history)
3. Click an open action card to expand its detail

### Approve or decline a variation
4. Read the variation: what is changing, the cost (shown inc-GST), the schedule impact, and the **builder's reasoning** if the builder added it
5. Click **Approve** or **Decline**
6. Optionally add a note (a decline reason is encouraged but not forced)
7. Submit — the card moves to completed

### Confirm or decline a meeting
4. Read the meeting time, location/link, and agenda
5. Click **Confirm** or **Can't make it / Decline**
6. Submit — the builder is notified

### Notify a payment ("I've paid")
4. Open the progress claim action
5. After you have made the bank transfer, click **I've paid / Notify payment**
6. Submit — this tells the builder to watch for the funds; it is a notification, not a receipt

### Make a selection
4. A selection action on My Actions links you to the **Selections** tab
5. Choose your option there (cost and lead-time impact shown) — see SOP 11-13 / Selections
6. The selection action clears once a choice is recorded

> 💡 **Tip:** A declined variation cannot be re-opened from your side — if you change your mind, message the builder and they will re-issue it. Approve carefully.

[insert screenshot: My Actions feed with open variation, meeting and payment cards]

## 6. What happens next
- The action's status flips from `pending` to the chosen outcome, and the card moves to the completed group
- For a **variation**: the decision is approved/declined, the response is mirrored to the finance record, and a signed PDF is archived to the client's Documents
- For a **meeting**: confirm/decline is recorded; a best-effort email notifies the builder
- For a **payment notification**: `client_payment_notified_at` is stamped and the builder is emailed
- For a **selection**: the choice is recorded against the selection (see SOP 11-13)
- Every contractual response is written to the **immutable audit log** (`portal_audit_logs`) with the client's account, IP and timestamp

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Declining a variation with no reason | The decline note is optional | Add a one-line reason so the builder can re-issue correctly — a silent decline just clears the counter |
| Tapping "I've paid" before transferring | Treating it as a request, not a confirmation | Only click it after the bank transfer is actually sent — it notifies the builder to expect funds |
| Expecting to undo an approval | The status guard only allows a pending decision to be acted on | Approvals are one-way; message the builder if you made a mistake |
| Trying to complete a selection on My Actions | Selection actions redirect to the Selections tab | Make the choice on the Selections tab; it then clears here |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Please log in to continue" when responding | The action requires a logged-in client; an anonymous/legacy-token session cannot write | Log in with the client account (SOP 11-10) |
| Approve/Decline button does nothing | Network error, or the decision is no longer `pending` (already responded) | Reload My Actions; if it shows in completed, it was already actioned |
| A selection card has no Approve button | Selection actions are not actioned inline — they link to Selections | Open the Selections tab and choose there |
| Payment notified twice | Idempotency is not enforced on payment-notify | Notify once; if unsure whether it sent, message the builder rather than re-clicking |
| Action still shows after responding | The feed did not refresh | Pull to refresh / reload the page |

## 9. Related modules
- [Client Login & Invite](11-10_v2_client_login_and_invite.md) — SOP 11-10 (must be logged in to respond)
- [Admin Console](11-12_v2_admin_console.md) — SOP 11-12 (where the builder creates variations, meetings, selections, and adds reasoning)
- [Project Journey & Documents](11-13_v2_project_journey_and_documents.md) — SOP 11-13 (selection choices and the archived variation PDF)

## 10. Screenshot placeholders
[insert screenshot: My Actions tab with open and completed groups]
[insert screenshot: expanded variation card showing cost inc-GST and builder reasoning]
[insert screenshot: completed action after the client has responded]

## 11. Automation notes
- API (feed): `GET /api/portal/app/:projectId/actions` → open/completed split from `client_actions`
- API (variation detail): `GET /api/portal/app/:projectId/variations/:id` — writes a `variation.viewed` audit row on view
- API (variation respond): `POST /api/portal/app/:projectId/variations/:id/respond` — body `{ action: 'approve' | 'decline', clientNote? }` — guarded by `requirePortalLogin` **and** `requirePortalWrite`
  - On approve: flips `job_variations.status = 'signed'` + `signed_date`, mirrors to finance, archives a PDF into `portal_documents`
  - Status changes: decision `pending → approved | declined`
- API (claim payment): `POST /api/portal/app/:projectId/claims/:id/payment-notify` — login-gated — sets `client_payment_notified_at`, emails the builder
- API (meeting confirm/decline): `POST /api/portal/app/:projectId/meetings/:id/confirm` and `/decline` — login-gated — records RSVP, best-effort email to builder
- API (selection): `POST /api/portal/app/:projectId/selections/:id/select` — login-gated — records the chosen option (see SOP 11-13)
- Record created/updated in: `client_actions` (status), `portal_decisions`/`job_variations` (variation), `portal_claims` (payment flag), `portal_meetings` (RSVP), `client_selections` (choice)
- Audit: every contractual response writes to `portal_audit_logs` (variation respond treats an audit-write failure as fatal and rolls back; the other paths write best-effort)
- Notification: builder emailed on decline / payment-notify / message (recipient currently `admin@blueleafbuilding.com.au`)

## 12. Edge cases and limits
- An empty decline note is allowed — the variation is still declined
- A decision that is no longer `pending` cannot be re-actioned (no re-open from the client)
- Payment-notify is self-asserted with no proof and no amount validation; idempotency is not enforced
- `selection_decision`, `client_rfi`, `colour_approval`, `handover_item`, `document_signature`, and `weekly_update` action types exist in the schema, but only variation / claim / meeting / selection have client handlers — other types render as inert text
- Anonymous/legacy-token callers can read the feed but cannot respond (writes are login-gated)

## 13. Owner of the process
Admin  
Next review date: 2026-12-21

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Migration 103 applied; portal v2 enabled on the test project
- [ ] A logged-in test **client** account that is a member of the project (SOP 11-10)
- [ ] At least one open variation action, one meeting action, and one progress-claim action exist for the project (create via the admin console / sync hooks)

### Test cases

**TC-01 — Happy path (standard use): approve a variation**
1. As the logged-in client, open **My Actions** and expand the variation card
2. Click **Approve**, leave the note blank, submit
3. Expected result: the card moves to **completed**; cost was shown inc-GST
4. Expected DB record: the related `portal_decisions` row `status = 'approved'` with `responded_at` set; `job_variations.status = 'signed'` with `signed_date`; a `client_actions` row marked complete; a row archived into `portal_documents`
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. Open a variation card and click **Decline** without entering a reason
2. Submit
3. Expected result: the decline is **accepted** (a decline reason is optional) — document that no validation error blocks it, and the action completes with an empty `client_note`
4. Expected DB: decision `status = 'declined'` (no new duplicate record)
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission**
1. Complete TC-01 (approve a variation)
2. Immediately call `POST /api/portal/app/:projectId/variations/:id/respond` again with the same body
3. Expected result: the second response is rejected/no-op because the decision is no longer `pending` (status guard only allows pending) — document the exact response (e.g. 400 / "already responded")
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role (anonymous/legacy token cannot write)**
1. Without a logged-in client JWT (e.g. using only a legacy share token, or no auth), call `POST /api/portal/app/:projectId/variations/:id/respond`
2. Expected result: HTTP **403** with `requiresLogin` (blocked by `requirePortalLogin` / `requirePortalWrite`); no status change
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification**
1. Complete a meeting **decline** (TC happy path for a meeting) and a **payment-notify**
2. Check: a builder notification email was sent on decline and on payment-notify
3. Check DB: meeting RSVP recorded; `client_payment_notified_at` set on the claim
4. Check: contractual responses appear in `portal_audit_logs` with the client's account, IP and UA
- [ ] Pass  [ ] Fail

**TC-06 — Confirm a meeting (feature-specific happy path)**
1. As the client, open the meeting action and click **Confirm**
2. Expected result: the action clears to completed
3. Expected DB: the `portal_meetings` row shows confirmed; the linked `client_actions` row is completed; an audit row is written
- [ ] Pass  [ ] Fail

**TC-07 — Selection action redirects, not inline (feature-specific)**
1. Ensure a selection action exists in the feed
2. As the client, open the selection action
3. Expected result: there is **no inline approve** — the action links to the **Selections** tab; making the choice there clears the action from My Actions
4. Expected DB: after choosing on Selections, the `client_selections` status reflects the choice and the `client_actions` selection row is completed
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created/updated with correct field values (`portal_decisions`, `job_variations`, `portal_meetings`, `portal_claims`, `client_actions`, `portal_audit_logs`)
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

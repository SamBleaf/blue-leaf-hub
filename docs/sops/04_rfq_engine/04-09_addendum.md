---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 04-09: Create and Send an Addendum

**Module:** Tender Manager → Quote Tracker → Package Detail (`/tender-manager/rfq-packages/:packageId`)
**SOP ID:** 04-09
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin (tender coordinators)

## 2. When to use it

When the scope of works, drawings, or project details change after RFQ emails have already been sent. An addendum notifies subcontractors of the change so they can update their quote if needed.

Common reasons for an addendum:
- Architect issues revised drawings
- Client requests a scope change
- Site investigation reveals additional work (e.g. rock)
- A material specification changes (e.g. different cladding system)

This SOP covers the addendum feature inside the **Quote Tracker** at `/tender-manager/rfq-packages/:packageId` — not the RFQ Engine wizard.

## 3. What this does

Creates a numbered addendum record against the RFQ package and optionally sends email notifications to all subcontractors who have received an RFQ for the affected trades.

Addenda are auto-numbered (Addendum 1, Addendum 2, etc.) based on how many already exist for this package.

**What the addendum email contains:**

> Hi [name],
>
> Please note Addendum [N] — [name] has been issued for [project address].
> This addendum affects your trade scope. Please review and update your quote if necessary.
>
> If you have any questions, don't hesitate to contact us.
>
> Thanks, [sender name]

The email is sent via the same Gmail integration used for RFQ sends.

**Who receives the addendum email:**

Only recipients matching ALL of these conditions receive the addendum email:
- Their trade is in the `affected_trades` list you selected
- Their status is `sent`, `reminded`, or `followed_up` (not `accepted`, `declined`, `received`, or `no_quote`)

Subcontractors who have already been accepted or declined do not receive the addendum.

**Tracking addenda:**

The Addenda section of the package lists all addenda in order:
- Addendum 1 — [name] — Sent [date]
- Addendum 2 — [name] — Not sent

If `Send emails now` was unticked, the addendum shows as "Not sent" — useful for recording internal scope changes that don't warrant re-notifying all subcontractors.

## 4. Before you start

- RFQ emails must already have been sent (the package must exist — recipients must have `status` = `sent`, `reminded`, or `followed_up`)
- Know: what has changed, which trades are affected
- Open the package at `/tender-manager/rfq-packages/:packageId`

## 5. Step-by-step process

1. Navigate to **Tender Manager → Quote Tracker** or go directly to `/tender-manager/rfq-packages`
2. Open the package at `/tender-manager/rfq-packages/:packageId`
3. Scroll to the **Addenda** section at the bottom of the package overview
4. Click **+ Add addendum**
5. In the modal:
   - **Addendum name** (required) — describe the change, e.g. "Revised structural drawings — 20 May 2026"
   - **Affected trades** — tick the trades that are affected. Only relevant trade subcontractors will be emailed.
   - **Send emails now** — if ticked, emails are sent immediately on save. If unticked, the addendum is created but no emails are sent.
6. Click **Add addendum**

The addendum is saved with a number (Addendum 1, 2, etc.) and optionally emails are sent.

## 6. What happens next

- `rfq_addenda` row created with `number`, `name`, `affected_trades`, `package_id`
- If emails sent: `rfq_addenda.sent_at` = now
- The addendum appears in the Addenda section of the package with its number and sent date

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Forgetting to tick affected trades | Rushing | Always select the specific affected trades — otherwise subcontractors who aren't affected receive unnecessary emails |
| Using an addendum instead of a correction | Not sure which | Corrections before any quotes are received don't need a formal addendum — edit the scope in the RFQ Engine wizard (?resume= path). An addendum is for changes made after quotes have been received. |
| Not creating an addendum for revised drawings | "I'll tell them directly" | Any scope change after sending must be documented. An addendum creates a paper trail if a subcontractor later claims they weren't notified. |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Cannot find the Addenda section | Scroll to the bottom of the package detail page at `/tender-manager/rfq-packages/:packageId` |
| Addendum number is wrong | Numbers are auto-assigned — the next available number is used. If an earlier addendum was deleted, the sequence may skip. This is by design. |
| "Name required" error | The addendum name / description field cannot be blank |
| Email not received by subcontractor | Check recipient status — only `sent`, `reminded`, or `followed_up` recipients get addendum emails. Recipients with status `accepted`, `declined`, or `received` are excluded. |
| Want to send emails later | Create the addendum with `Send emails now` unticked, then contact recipients manually. There is no "send now" action for a saved addendum — emails can only be sent at creation time. |

## 9. Related SOPs

- [Receive and Record Quotes](04-06_receive_quotes.md) — SOP 04-06
- [Send RFQ Emails](04-05_send_rfq.md) — SOP 04-05 (original send — use addendum only after this)

## 10. Screenshots

[insert screenshot: Addenda section at bottom of package detail page]
[insert screenshot: Add addendum modal with affected trades and send emails checkbox]

## 11. Automation notes

- API: `POST /api/rfq-packages/:packageId/addenda`
- Body: `{ name (required), affected_trades (array of trade_ids), send_emails (boolean) }`
- Auto-numbers from `MAX(rfq_addenda.number) + 1` for this package (starts at 1)
- Emails sent via `sendPlainMail()` (Gmail OAuth)
- Only recipients with `status IN ('sent', 'reminded', 'followed_up')` receive the addendum email
- After sending: `rfq_addenda.sent_at` = now()
- Response: `{ ok: true, addendum, emailResults: [{email, ok, error?}] }`

## 12. Edge cases and limits
- Emails can only be sent at creation time — there is no "send now" action for a saved addendum. If you created an addendum without sending, contact recipients manually.
- Auto-numbering uses `MAX(number) + 1` — if an addendum is deleted, the sequence will skip that number. This is by design.
- Only recipients at status `sent`, `reminded`, or `followed_up` receive addendum emails — accepted, declined, and received recipients are intentionally excluded.

## 13. Owner of the process

Admin
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup

- [ ] A package exists at `/tender-manager/rfq-packages` with at least 2 trade scopes, each with at least 1 sent recipient (status = `sent`)
- [ ] One of the sent recipients must have email = sam@blueleafbuilding.com.au

### Test cases

**TC-01 — Create addendum with email send (happy path)**
1. Navigate to `/tender-manager/rfq-packages/:packageId`
2. Scroll to the Addenda section and click + Add addendum
3. Name = "Revised structural drawings — test addendum"
4. Tick 1 affected trade (the one with sam@blueleafbuilding.com.au as a sent recipient)
5. Tick "Send emails now"
6. Click Add addendum
7. Expected: addendum appears in the Addenda section as "Addendum 1 — Revised structural drawings — test addendum — Sent [date]"
8. Expected: email arrives at sam@blueleafbuilding.com.au within 5 minutes
9. Expected: email subject and body reference "Addendum 1" and the project address
10. Expected DB: `rfq_addenda` row with `number = 1`, `name = "Revised structural drawings — test addendum"`, `sent_at` set to now

- [ ] Pass  [ ] Fail

**TC-02 — Auto-numbering**
1. Create a second addendum on the same package
2. Expected: second addendum is numbered 2 (Addendum 2)
3. Expected DB: `rfq_addenda.number = 2` for the second row
- [ ] Pass  [ ] Fail

**TC-03 — Name required**
1. Open the Add addendum modal
2. Leave the name field blank
3. Click Add addendum
4. Expected: "Name required" error shown, no row created
- [ ] Pass  [ ] Fail

**TC-04 — Only eligible recipients emailed**
1. Set up a trade with 3 recipients: one `sent`, one `accepted`, one `declined`
2. Create an addendum affecting that trade with send_emails = true
3. Expected: only the `sent` recipient receives the email
4. Expected DB: `emailResults` array shows ok:true for the `sent` recipient only; `accepted` and `declined` not in results
- [ ] Pass  [ ] Fail

**TC-05 — Create addendum without sending emails**
1. Create an addendum with "Send emails now" unticked
2. Expected: addendum created successfully
3. Expected DB: `rfq_addenda.sent_at` is null (not set)
4. Expected: addendum shows "Not sent" in the Addenda section
- [ ] Pass  [ ] Fail

**TC-06 — Feature case: multiple affected trades**
1. Create an addendum affecting 2 different trades, both with sent recipients
2. Expected: recipients in both trades receive the addendum email
3. Expected DB: `rfq_addenda.affected_trades` array contains both trade IDs
- [ ] Pass  [ ] Fail

### Post-test checklist

- [ ] Addendum creates with correct auto-number
- [ ] Email sent to eligible (sent/reminded/followed_up) recipients only
- [ ] Email arrives at sam@blueleafbuilding.com.au
- [ ] Name required enforced
- [ ] sent_at set only when send_emails = true
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

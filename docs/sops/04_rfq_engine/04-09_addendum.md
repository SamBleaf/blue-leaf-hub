---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 04-09: Create and Send an Addendum

**Module:** Tender Manager → RFQ Engine → Package Detail  
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

## 3. What this does
Creates a numbered addendum record against the RFQ package and optionally sends email notifications to all subcontractors who have received an RFQ for the affected trades.

Addenda are auto-numbered (Addendum 1, Addendum 2, etc.) based on how many already exist for this package.

## 4. Before you start
- RFQ emails must already have been sent (recipients must exist with status `sent`, `followed_up`, or `received`)
- Know: what has changed, which trades are affected

## 5. Step-by-step process

1. Open the RFQ package
2. Scroll to the **Addenda** section at the bottom of the package overview
3. Click **+ Add addendum**
4. In the modal:
   - **Addendum name** (required) — describe the change, e.g. "Revised structural drawings — 20 May 2026"
   - **Affected trades** — tick the trades that are affected by this change. Only relevant trade subcontractors will be emailed.
   - **Send emails now** — if ticked, emails are sent immediately on save. If unticked, the addendum is created but no emails are sent.
5. Click **Add addendum**

The addendum is saved with a number (Addendum 1, 2, etc.) and optionally emails are sent.

## 6. What the email contains

The addendum email sent to affected subcontractors reads:

> Hi [name],
>
> Please note Addendum [N] — [name] has been issued for [project address].
> This addendum affects your trade scope. Please review and update your quote if necessary.
>
> If you have any questions, don't hesitate to contact us.
>
> Thanks, [sender name]

The email is sent via the same Gmail integration used for RFQ sends.

## 7. Who receives the addendum email

Only recipients matching ALL of these conditions receive the addendum email:
- Their trade is in the `affected_trades` list you selected
- Their status is `sent`, `followed_up`, or `received` (not `accepted`, `declined`, or `no_quote`)

Subcontractors who have already been accepted or declined do not receive the addendum.

## 8. After creating

- `rfq_addenda` row created with `number`, `name`, `affected_trades`, `package_id`
- If emails sent: `rfq_addenda.sent_at` = now
- The addendum appears in the Addenda section of the package with its number and sent date

## 9. Tracking addenda

The Addenda section of the package lists all addenda issued, in order:
- Addendum 1 — [name] — Sent [date]
- Addendum 2 — [name] — Not sent

If `sent_emails = false` was chosen, the addendum shows as "Not sent" — useful for recording internal scope changes that don't warrant re-notifying all subcontractors.

## 10. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Forgetting to tick affected trades | Rushing | Always select the specific affected trades — otherwise subcontractors who aren't affected receive unnecessary emails |
| Using an addendum instead of a correction | Not sure which | Corrections before any quotes are received don't need a formal addendum — just edit the scope directly. An addendum is for changes made after quotes have been received. |
| Not creating an addendum for revised drawings | "I'll tell them directly" | Any scope change after sending must be documented. An addendum creates a paper trail if a subcontractor later claims they weren't notified. |

## 11. Troubleshooting

| Problem | Solution |
|---------|----------|
| Addendum number is wrong | Numbers are auto-assigned — the next available number is used. If an earlier addendum was deleted, the sequence may skip. This is by design. |
| "Name required" error | The addendum name / description field cannot be blank |
| Email not received by subcontractor | Check recipient status — only `sent`, `followed_up`, or `received` recipients get addendum emails. If status is `accepted` or `declined`, they are excluded. |
| Want to send emails later | Create the addendum with `send_emails` unticked, then contact recipients manually. There is no "send now" action for a saved addendum — emails can only be sent at creation time. |

## 12. Automation notes
- API: `POST /api/rfq-packages/:packageId/addenda`
- Body: `{ name (required), affected_trades (array of trade_ids), send_emails (boolean) }`
- Auto-numbers from `MAX(rfq_addenda.number) + 1` for this package (starts at 1)
- Emails sent via `sendPlainMail()` (Gmail OAuth)
- Only recipients with `status IN ('sent', 'followed_up', 'received')` receive the addendum email
- After sending: `rfq_addenda.sent_at` = now()
- Response: `{ ok: true, addendum, emailResults: [{email, ok, error?}] }`

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] An RFQ package with at least 2 trade scopes, each with at least 1 sent recipient (status = `sent`)
- [ ] One of the sent recipients must have email = sam@blueleafbuilding.com.au

### Test cases

**TC-01 — Create addendum with email send (happy path)**
1. Open an RFQ package with sent recipients
2. Click + Add addendum
3. Name = "Revised structural drawings — test addendum"
4. Tick 1 affected trade (the one with sam@blueleafbuilding.com.au as a recipient)
5. Tick "Send emails now"
6. Click Add addendum
7. Expected: addendum appears in the Addenda section as "Addendum 1"
8. Expected: email arrives at sam@blueleafbuilding.com.au with subject "Addendum 1 — [project address]"
9. Expected: email body contains "Addendum 1 — Revised structural drawings — test addendum"
10. Expected DB: `rfq_addenda` row with `number = 1`, `name = "Revised structural drawings — test addendum"`, `sent_at` set to now
- [ ] Pass  [ ] Fail

**TC-02 — Auto-numbering**
1. Create a second addendum on the same package
2. Expected: second addendum is numbered 2 (Addendum 2)
3. Expected DB: `rfq_addenda.number = 2` for the second row
- [ ] Pass  [ ] Fail

**TC-03 — Name required**
1. Attempt to create an addendum with no name
2. Expected: "Name required" error shown, no row created
- [ ] Pass  [ ] Fail

**TC-04 — Only eligible recipients emailed**
1. Set up a trade with 3 recipients: one `sent`, one `accepted`, one `declined`
2. Create an addendum affecting that trade with send_emails = true
3. Expected: only the `sent` recipient receives the email
4. Expected DB: emailResults array shows ok:true for `sent` recipient; `accepted` and `declined` not in the results
- [ ] Pass  [ ] Fail

**TC-05 — Create addendum without sending emails**
1. Create an addendum with send_emails = false (untick "Send emails now")
2. Expected: addendum created successfully
3. Expected DB: `rfq_addenda.sent_at` is null (not set)
4. Expected: addendum shows "Not sent" in the UI
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Addendum creates with correct auto-number
- [ ] Email sent to eligible recipients only
- [ ] Email arrives at sam@blueleafbuilding.com.au
- [ ] Name required enforced
- [ ] sent_at set only when send_emails = true
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

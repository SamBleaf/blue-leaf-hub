---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 04-05: Send RFQ Emails to Subcontractors

**Module:** Tender Manager → RFQ Engine → Package Detail  
**SOP ID:** 04-05  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin (tender coordinators)

## 2. When to use it
After trade scopes have been reviewed and subcontractors assigned. When you're ready to invite subcontractors to quote.

## 3. What this does
Sends one email per subcontractor per trade scope. Each email contains the scope of works, exclusions, questions, and deadline for that specific trade. Uses Gmail (existing integration) to send via the Blue Leaf email account.

## 4. Before you start
- Each trade scope must have: at least 1 scope bullet point, at least 1 recipient assigned, a due date set
- Gmail integration must be configured (GMAIL_REFRESH_TOKEN in Railway)

## 5. Step-by-step process

**Sending a single trade:**
1. Open the RFQ package
2. Open the trade scope you want to send
3. Review the email body preview (if shown)
4. Click **Send** (or **Send RFQ** for this trade)
5. The email is sent to all assigned recipients for this trade
6. Recipient status changes from `draft` to `sent`
7. Trade scope status changes to `sent`

**Sending all trades at once:**
1. On the package overview, click **Send all ready**
2. The system checks each scope for send-readiness
3. All ready scopes are sent simultaneously
4. Any scope that fails the readiness check is skipped with a warning

## 6. What the email contains

Each RFQ email includes:
- Project address and project type
- Trade being quoted
- Scope of works bullet points
- Explicit exclusions list
- Questions to answer in the quote
- Due date for quote submission
- Blue Leaf contact details for clarifications

The email is sent as plain text with a structured layout. It comes from the Blue Leaf Gmail account.

## 7. After sending

- `rfq_recipients.status` → `'sent'`, `sent_at` = now
- `rfq_trade_scopes.status` → `'sent'`
- A mirrored row is created in the `rfqs` table (legacy quote tracker) for this job
- Coverage score recalculated for the package

## 8. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Sending to wrong email | Typo in subcontractor register | Verify email addresses before sending |
| Sending before scope is finalised | Rushing | Review every scope bullet point before sending — corrections after sending require an addendum (SOP 04-09) |
| Not setting a due date | Forgot | Always set a due date — "when can you get it to us?" is unprofessional |

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| "recipients required" error | Assign at least 1 subcontractor to the trade before sending |
| Send fails for one recipient | Check the recipient's email address for typos; check Gmail integration is working |
| Trade scope status stays "draft" after sending | The scope only advances to "sent" when **all** recipients succeed. Even one failed recipient keeps the scope in "draft". Fix the failing address and resend — only the recipient whose email was wrong needs to be retried. |

## 10. Automation notes
- API: `POST /api/rfq-packages/:packageId/scopes/:tradeId/send` with `{ recipients, email_subject, email_body, due_date }`
- Sends via `sendPlainMail()` (Gmail OAuth) — falls back to SMTP if Gmail fails
- Per-recipient results returned: `[{ email, ok, error? }]` — partial success possible
- **Scope status rule:** scope only advances to `sent` when ALL recipients succeed. If any recipient fails, the scope stays in its prior status (`draft`) and `partial: true` is returned. Staff must fix the failing address and resend.
- After successful send: creates `rfqs` row in legacy quote tracker for the job
- Coverage score: `recomputePackageCoverage()` called after send

## 11. Owner of the process
Admin  
Next review: 2026-11-29

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] An RFQ package with at least 1 trade scope that has scope bullet points AND a subcontractor recipient assigned
- [ ] Gmail integration configured (GMAIL_REFRESH_TOKEN set)
- [ ] Test recipient email = **sam@blueleafbuilding.com.au** (add to a test subcontractor record)

### Test cases

**TC-01 — Send RFQ email (happy path)**
1. Add a test subcontractor with email = sam@blueleafbuilding.com.au to a trade scope
2. Click Send for that trade
3. Expected: email arrives at sam@blueleafbuilding.com.au within 5 minutes
4. Expected: email contains the trade name, scope bullet points, and due date
5. Expected DB: `rfq_recipients.status = 'sent'`, `sent_at` = now
6. Expected DB: `rfq_trade_scopes.status = 'sent'`
7. Expected DB: `rfqs` row created for this job and trade
- [ ] Pass  [ ] Fail

**TC-02 — No recipients error**
1. Create a trade scope with no recipients
2. Attempt to send
3. Expected: "recipients required" error — no email sent
- [ ] Pass  [ ] Fail

**TC-03 — Partial success handled gracefully**
1. Add 2 recipients to a trade: one valid email (sam@blueleafbuilding.com.au), one invalid email (notanemail)
2. Send
3. Expected: email sent to sam@blueleafbuilding.com.au (ok: true)
4. Expected: notanemail returns ok: false with an error message
5. Expected: response `partial: true`
6. Expected: the valid recipient's status updates to 'sent'; the invalid one shows an error
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Email arrives at test address
- [ ] Email contains correct scope content
- [ ] Recipient and scope status update to 'sent'
- [ ] rfqs row created in quote tracker
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

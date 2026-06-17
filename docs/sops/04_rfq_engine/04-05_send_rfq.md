---
sop_version: 1.1
last_reviewed: 2026-06-17
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: untested
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

Each RFQ email is structured to make it easy for a subcontractor to act quickly (this lifts reply rates):
- Subject line leads with the **trade**, then the project address, then the price-by date — e.g. `Carpentry quote — 12 Stirling St (price by Fri 27 Jun, 5pm)`. Trade first so subbies can filter their inbox at a glance.
- Personal greeting using the subcontractor contact name where known
- A warm one-line opener inviting them to look at the job
- **The ask up front**: a single clear line stating exactly what's needed (lump sum price ex GST), the deadline, and how to respond (just reply to the email)
- Tender documents link (Dropbox)
- Scope of works bullet points
- Optional sections only when present: items to confirm, assumptions/site conditions, general/standards requirements, tender and submission requirements, and a flagged "missing information" block
- A **bid / no-bid line** near the end — invites a quick "not this time" reply if they can't quote, with a note that they'll be kept top of the list for the next fitting job. Giving an easy out measurably increases overall reply rates.
- A low-effort closing CTA ("just reply here or give me a call") and the Blue Leaf signature

The email is sent as plain text (HTML variant with logo when a signature logo is configured). It comes from the Blue Leaf Gmail account. Composition logic lives in `src/lib/rfqComposer.js` (`composeRfqEmail`).

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

## 13. RFQ Engine wizard — Step 4 dispatch (edit-lock + per-email send)

> This section covers the **RFQ Engine wizard** (`Tender Manager → RFQ Engine`, the 4-step PDF→trades→recipients→dispatch flow in `src/pages/RfqEngine.jsx`). It is distinct from the Package Detail send above. The wizard composes a draft per subcontractor per trade on **Step 4 · Review drafts & dispatch**, then dispatches via `POST /api/rfq/send` (SMTP/Gmail — same transport as above).

### What changed (2026-06-17)
- **Edit-lock.** Once you reach Step 4, drafts are **frozen against automatic regeneration**. Changing trades, recipients, contact details, applying settings, the subcontractor list finishing loading, or **leaving the page and coming back** will no longer wipe or revert an edited draft. Only the explicit **↻ Regenerate emails** button rewrites drafts — and even then any **already-sent** row is left untouched.
- **Navigate-away is safe.** The wizard remembers the furthest step you reached. Leaving Step 4 and returning lands you **back on Step 4** with every edit (and every sent row) intact — it no longer bounces you to Step 3, and pressing Compose no longer reverts your edits.
- **Per-email Send button.** Each draft now has its own **Send this RFQ** button. You can send one subcontractor at a time. A sent row shows a green **✓ Sent** badge and its Subject/Body lock (read-only) so it can't be edited or re-sent.
- **Batch button counts unsent only.** The top button now reads **Send N RFQ emails** / **Send remaining N** (and **All RFQs sent** when none remain). It sends only rows that haven't been sent yet.
- **Sends are serialized.** Only one send runs at a time (per-row or batch) — every other Send button greys out while one is in flight. This prevents a duplicate job/folder being created by two simultaneous first sends.
- **The package is built once, when the last draft is sent** — whether you finished via the batch button or by sending the final row individually. At that point the session resets and you're taken to the new RFQ package.
- **A failed send rolls itself back** (the queued RFQ row it created is deleted) and shows the error on that specific draft, so retrying never leaves orphan rows.

### How to use it
1. Reach Step 4. Edit any draft's subject/body as needed — edits auto-save (an **✏️ Edited — saved** chip appears).
2. To send one: click **Send this RFQ** on that draft. Wait for **✓ Sent**.
3. To send the rest: click **Send remaining N** at the top.
4. When all non-blocked drafts are sent, the RFQ package is created and you're navigated to it.

### Automation notes
- Per-row send + batch both call `sendOneRow()` → `persistRfqs([message])` → `POST /api/rfq/send` (1-element array). Server idempotency (`job_id` + `subcontractor_id` + `status='sent'`) blocks any accidental re-send.
- Edits/sent state persist in `localStorage` (`blhub_rfq_session`, `version: 3`, carries `highestStep` + per-row `sent`/`sentAt`/`rfqId`). On restore, transient `sending` flags are cleared so a row can never be stuck on "Sending…".
- Each successful send marks `rfqs.status='sent'`, logs `correspondence` (outbound), and saves an email copy to Dropbox.

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

### RFQ Engine wizard — Step 4 (edit-lock + per-email send)

**TC-04 — Edit survives navigate-away**
1. In the RFQ Engine wizard, reach Step 4 with at least 2 drafts.
2. Edit a draft's body (change the recipient name or add a line). Confirm the ✏️ Edited — saved chip appears.
3. Navigate to another page (e.g. Dashboard), then return to the RFQ Engine.
4. Expected: lands on **Step 4** (not Step 3).
5. Expected: the edited draft still shows your edit (NOT reverted to the generated default).
- [ ] Pass  [ ] Fail

**TC-05 — Send one row leaves the others untouched**
1. On Step 4 with ≥2 drafts (one with a test address sam@blueleafbuilding.com.au), edit a SECOND draft's body.
2. Click **Send this RFQ** on the first draft only.
3. Expected: first draft → green **✓ Sent**, its subject/body locked.
4. Expected: the second draft still shows your edit, still editable, still unsent.
5. Expected DB: exactly one `rfqs` row `status='sent'`; one `correspondence` outbound row.
- [ ] Pass  [ ] Fail

**TC-06 — Regenerate keeps sent rows**
1. After TC-05 (one row sent, one edited-unsent), click **↻ Regenerate emails** and confirm.
2. Expected: the unsent edited draft is regenerated (edit discarded — that's intended).
3. Expected: the **sent** row is still **✓ Sent** and still locked (NOT reverted to an editable unsent draft).
- [ ] Pass  [ ] Fail

**TC-07 — Batch sends only the remaining, then builds the package once**
1. With one row already sent, the top button should read **Send remaining N**.
2. Click it. Expected: only the unsent rows send (the already-sent one is not re-sent — check no duplicate `rfqs` rows for it).
3. Expected: once every non-blocked row is sent, an RFQ package is created and you're navigated to it; the session resets.
- [ ] Pass  [ ] Fail

**TC-08 — Reload mid-flow is safe**
1. On Step 4, send one row, edit another, then reload the page (Cmd-R).
2. Expected: lands on Step 4; the sent row is still ✓ Sent + locked; the edited row still shows its edit; no row is stuck on "Sending…".
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Email arrives at test address
- [ ] Email contains correct scope content
- [ ] Recipient and scope status update to 'sent'
- [ ] rfqs row created in quote tracker
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

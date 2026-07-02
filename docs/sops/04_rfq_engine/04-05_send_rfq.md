---
sop_version: 1.2
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP 04-05: Send RFQ Emails to Subcontractors

**Module:** Tender Manager → RFQ Engine (`/tender-manager/rfq-engine`) — Step 4
**SOP ID:** 04-05
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin (tender coordinators)

## 2. When to use it

After trade scopes have been reviewed (Step 2) and subcontractors assigned (Step 3). When you're ready to invite subcontractors to quote.

This SOP covers **Step 4 — Review drafts & dispatch** of the RFQ Engine wizard at `/tender-manager/rfq-engine`. This is the final step of the wizard; when all emails are sent the package is created and you are navigated to `/tender-manager/rfq-packages/:packageId`.

## 3. What this does

Sends one email per subcontractor per trade scope. Each email contains the scope of works, exclusions, questions, and deadline for that specific trade. Emails are sent via Gmail (existing integration) from the Blue Leaf email account.

**What the email contains:**

Each RFQ email is structured to make it easy for a subcontractor to act quickly:
- Subject line leads with the **trade**, then the project address, then the price-by date — e.g. `Carpentry quote — 12 Stirling St (price by Fri 27 Jun, 5pm)`
- Personal greeting using the subcontractor contact name where known
- A warm one-line opener inviting them to look at the job
- **The ask up front:** a single clear line stating what's needed (lump sum price ex-GST), the deadline, and how to respond (just reply to the email)
- Tender documents link (Dropbox, if configured)
- Scope of works bullet points
- Optional sections only when present: items to confirm, site conditions, requirements, missing-information block
- A **bid / no-bid line** near the end — invites a quick "not this time" reply, which measurably increases overall reply rates
- A low-effort closing CTA and the Blue Leaf signature

The email is sent as plain text with an HTML variant when a signature logo is configured. Composition logic is in `src/lib/rfqComposer.js`.

## 4. Before you start

- You must have completed Steps 1-3 of the RFQ Engine wizard
- Each selected trade must have at least 1 scope bullet point
- At least one recipient must be assigned per trade
- Gmail integration must be configured (`GMAIL_REFRESH_TOKEN` in Railway)

## 5. Step-by-step process

**Step 4 — Review drafts & dispatch:**

1. Reach Step 4 of the wizard at `/tender-manager/rfq-engine`
2. One draft card appears per subcontractor per trade — review each one:
   - Edit the **subject line** or **email body** of any draft (edits auto-save; an "Edited — saved" chip appears)
   - Blocked rows (red badge, missing email) cannot be sent — skip them or fix the email address first
3. **Send one at a time:** click **Send this RFQ** on an individual card. Wait for the green "Sent" badge.
4. **Send all at once:** click **Send N RFQ emails** at the top. This sends all un-sent, non-blocked rows.
   - After some are sent, the button reads **Send remaining N** to clarify only the unsent rows will go out
5. Once all non-blocked drafts are sent:
   - The package record is created automatically
   - The wizard resets and navigates you to the new package at `/tender-manager/rfq-packages/:packageId`

> **Edit-lock:** once on Step 4, drafts are frozen against automatic regeneration. Only the explicit "Regenerate emails" button (↻) rewrites drafts, and even then sent rows are never reverted. Navigate away and return — you land back on Step 4 with all edits and sent states intact.

**Resuming a partially-sent session:**

If you sent some emails but did not finish:
1. Return to `/tender-manager/rfq-engine` — the wizard restores to Step 4 with sent rows marked ✓ Sent
2. Click **Send remaining N** to send the rest
3. Alternatively, find the job in `/tender-manager/rfq-packages` (if the package was already created) and use the "Resume RFQ Engine" button — this opens the wizard pre-loaded with existing sent/unsent rows

## 6. What happens next

- Per-email: `rfqs.status` → `'sent'`, `sent_at` = now; correspondence row logged; email copy saved to Dropbox
- When all non-blocked rows are sent: `rfq_packages` row created, wizard session cleared, navigate to `/tender-manager/rfq-packages/:packageId`
- Post-send tracking (receiving quotes, chasing, comparing, accepting) happens in the **Quote Tracker** — see SOP 04-06 onwards

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Sending to the wrong email | Typo in subcontractor register | Verify email addresses before sending |
| Sending before scope is finalised | Rushing | Review every scope bullet point before sending — corrections after sending require an addendum (SOP 04-09) |
| Not setting a due date | Forgot | Set the deadline in Step 1 — "when can you get it to us?" is unprofessional |
| Re-sending an already-sent row | Clicking Send again | Sent rows are locked (read-only) — the Send button disappears after a successful send |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Send fails for one recipient | Check the recipient's email address for typos in Settings → Subcontractors; check Gmail integration is active |
| Row stuck on "Sending…" after page reload | Reload clears the sending flag — a row stuck on Sending was interrupted. It is safe to retry. |
| Package not created after all rows sent | Ensure every non-blocked row shows ✓ Sent. If one failed without recovery, refresh and retry. |
| "Session too large to auto-save" warning | Remove some attached PDFs from the queue — the localStorage quota is tight with many large attachments |

## 9. Related SOPs

- [Manage Trade Packages](04-04_trade_packages.md) — SOP 04-04 (Steps 2 & 3)
- [Receive and Record Quotes](04-06_receive_quotes.md) — SOP 04-06 (post-send, in Quote Tracker)
- [Create and Send an Addendum](04-09_addendum.md) — SOP 04-09 (if scope changes after sending)

## 10. Screenshots

[insert screenshot: Step 4 draft cards with Send this RFQ button and Sent badge]
[insert screenshot: All sent — navigating to package at /tender-manager/rfq-packages/:id]

## 11. Automation notes

- Per-row send: `sendOneRow()` → `persistRfqs([message])` → `POST /api/rfq/send` (1-element array)
- Batch send: same function, called for each unsent non-blocked row in sequence (serialised — only one in flight at a time to avoid duplicate job creation)
- Server idempotency guard: `job_id + subcontractor_id + status='sent'` — duplicate sends are silently skipped unless `force: true`
- Sent state persisted in `localStorage` per row: `sent: true`, `sentAt`, `rfqId`
- Session storage version: `blhub_rfq_session` version 3, includes `highestStep` so restore always lands on the furthest step reached
- A failed send rolls itself back (queued RFQ row deleted) and shows the error on that draft row only

## 12. Edge cases and limits
- The server idempotency guard silently skips re-sends to a `job_id + subcontractor_id` combination already at `status='sent'`, unless `force: true` is passed. If a re-send "doesn't arrive", suspect the guard first.
- Blocked rows (missing email address) are skipped by batch send and do not prevent package creation.
- The wizard session is cleared from `localStorage` after the package is created — returning to `/tender-manager/rfq-engine` after completion shows a blank Step 1.

## 13. Owner of the process

Admin
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup

- [ ] RFQ Engine wizard at Step 4 with at least 2 draft rows
- [ ] At least 1 recipient = sam@blueleafbuilding.com.au (add to a test subcontractor record)
- [ ] Gmail integration configured (`GMAIL_REFRESH_TOKEN` set in Railway)

### Test cases

**TC-01 — Send one RFQ email (happy path)**
1. On Step 4, locate the draft card for sam@blueleafbuilding.com.au
2. Click **Send this RFQ** on that card
3. Expected: card shows green ✓ Sent badge; subject/body become read-only
4. Expected: email arrives at sam@blueleafbuilding.com.au within 5 minutes containing the trade name, scope bullet points, and due date
5. Expected DB: `rfqs` row with `status = 'sent'`, `sent_at` set, `subcontractor_id` correct

- [ ] Pass  [ ] Fail

**TC-02 — Edit-lock: edits survive navigate-away**
1. On Step 4, edit a draft's body (add a line). Confirm the "Edited — saved" chip appears.
2. Navigate to another page (e.g. Dashboard), then return to `/tender-manager/rfq-engine`
3. Expected: lands on Step 4 (not Step 3)
4. Expected: the edited draft still shows the edit — not reverted to the generated default
- [ ] Pass  [ ] Fail

**TC-03 — Send one row leaves others untouched**
1. On Step 4 with ≥ 2 drafts, edit a SECOND draft's body
2. Click **Send this RFQ** on the first draft only
3. Expected: first draft → ✓ Sent and locked; second draft → still shows edit, still editable, still unsent
4. Expected DB: exactly one new `rfqs` row `status='sent'`
- [ ] Pass  [ ] Fail

**TC-04 — Batch send sends only remaining rows**
1. With one row already ✓ Sent, click **Send remaining N** at the top
2. Expected: only the unsent rows send (the already-sent one is not re-sent)
3. Expected DB: no duplicate `rfqs` rows for the already-sent subcontractor
4. Expected: once all non-blocked rows are sent, wizard navigates to `/tender-manager/rfq-packages/:id`
- [ ] Pass  [ ] Fail

**TC-05 — Regenerate keeps sent rows**
1. After TC-03 (one row sent, one edited-unsent), click ↻ Regenerate emails and confirm
2. Expected: the unsent edited draft is regenerated (edit discarded — that's intended)
3. Expected: the ✓ Sent row remains ✓ Sent and locked (NOT reverted to unsent editable draft)
- [ ] Pass  [ ] Fail

**TC-06 — Reload mid-flow is safe**
1. On Step 4, send one row, edit another, then reload the page (Cmd-R)
2. Expected: lands on Step 4; the sent row is still ✓ Sent + locked; the edited row still shows its edit; no row stuck on "Sending…"
- [ ] Pass  [ ] Fail

**TC-07 — Blocked row does not block package creation**
1. Step 4 includes one blocked row (missing email) and one sendable row
2. Send the sendable row
3. Expected: package is created and wizard navigates to it; the blocked row was skipped
- [ ] Pass  [ ] Fail

**TC-08 — Feature case: package created and navigated to after last send**
1. Complete all non-blocked sends in Step 4
2. Expected: wizard automatically navigates to `/tender-manager/rfq-packages/:id`
3. Expected: `rfq_packages` row in DB with `status = 'active'` and correct project address
4. Expected: wizard session cleared (returning to `/tender-manager/rfq-engine` shows blank Step 1)
- [ ] Pass  [ ] Fail

### Post-test checklist

- [ ] Email arrives at test address with correct content
- [ ] Sent rows lock and cannot be re-sent
- [ ] Edit-lock prevents auto-regeneration on Step 4
- [ ] Package created in DB after last email sent
- [ ] Wizard session clears after package creation
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

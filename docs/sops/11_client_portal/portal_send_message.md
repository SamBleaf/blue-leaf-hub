---
sop_version: 1.2
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 11-07: Send a Message to the Client

> **LEGACY — v1 token portal (fallback only).** For new jobs use the v2 client portal — see [00_PORTAL_STACK_MATRIX.md](00_PORTAL_STACK_MATRIX.md) and SOPs 11-10..11-13. In v2, the Messages tab uses a different API namespace (`/api/portal/app/:projectId/messages`). This SOP applies only to the legacy `/portal/:token` messaging stack.

**Module:** Client Portal — Admin  
**SOP ID:** 11-07  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin staff, project managers, and site supervisors who need to communicate with the client through the portal.

## 2. When to use it
- To send a non-urgent update or question to the client
- To follow up on a decision or variation
- When the client has sent a message through their portal and you are replying
- As an alternative to email for project-related communication (keeps everything in one place)

## 3. What this does
Sends a message from the builder to the client through the portal messaging system. The client sees the message in their portal's Conversations tab and can reply from there. All messages are stored and visible in chronological order to both parties.

## 4. Before you start
- The portal is enabled for this project (SOP 11-01)
- You are logged in as Admin

## 5. Step-by-step process

1. Go to **Portal Admin** → select the project → click the **Messages** tab
2. You will see any previous messages — client replies appear here too
3. Type your message in the compose box at the bottom
4. Click **Send**
5. The client sees the message immediately in their portal Conversations tab

## 6. What happens after
- The message is stored in the database linked to the project
- The client sees it in their Conversations tab
- When the client replies, the reply appears in the Portal Admin Messages tab
- No email notification is sent unless a separate notification system is configured — the client must check their portal

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Sending urgent information through the portal only | Assuming the client checks the portal regularly | For urgent matters, call or text first — the portal message is a written record, not a real-time alert |
| Sending messages to the wrong project | Multiple project tabs open | Check the project name in the portal admin header before sending |
| Long unbroken text blocks | Pasted from internal notes | Use short paragraphs — portal messages should be easy to read on a phone |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Send button not responding | Check your internet connection and try again; refresh the page |
| Client says they did not see the message | Remind them to check the Conversations tab in their portal; send a text to alert them |
| Message sent to wrong project | Messages cannot be moved — send a correction message; note the error in the project record |

## 9. Related SOPs
- [Enable the client portal for a project](portal_enable_for_client.md) — SOP 11-01
- [Client guide — using your portal](portal_client_guide.md) — SOP 11-09

## 10. Automation notes
- API (admin sends to client): `POST /api/portal/admin/builder-messages`
  - Body: `{ projectId, body, senderName? }` — the message text goes in **`body`** (not `message`)
  - `body` is required — omitting it returns HTTP 400 "projectId, body required"
  - Max length: 2000 characters
  - Response: `{ ok: true, message: { id, projectId, body, sender, sentAt, ... } }`
- API (client sends to builder): `POST /api/portal/:token/conversations`
  - Body: `{ body }` — the client's reply text goes in **`body`** (not `message`)
  - `body` is required — omitting it returns HTTP 400 "Message body required (max 2000 characters)."
  - Response: `{ ok: true, message: { ... } }`
- API (admin reads conversation): `GET /api/portal/admin/:projectId/summary` (messages included) or via portal summary
- API (client reads conversation): `GET /api/portal/:token/conversations`
- DB effects: inserts message row with `project_id`, `sender` ('builder' or 'client'), `body`, `sent_at`
- Note: DB column is `sender` (not `sender_type`)

## 11. Screenshot placeholders
[insert screenshot: Portal Admin Messages tab with compose box and thread]
[insert screenshot: Client portal Conversations tab showing builder message and reply box]

## 12. Edge cases and limits
- Message text goes in `body` — not `message`, not `text`; the wrong field name returns HTTP 400
- Maximum message length is 2000 characters; longer text is rejected
- The DB column for the sender is `sender` (values `'builder'` or `'client'`) — not `sender_type`
- No notification is sent to the client when a builder message is sent; contact the client by other means to alert them
- Messages cannot be edited or deleted once sent — add a follow-up message to correct an error
- Messages are project-scoped via the token; a token for Project A cannot read or write messages for Project B
- There is no read-receipt or delivered confirmation

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] A project with portal enabled exists and the portal token is known

### Test cases

**TC-01 — Admin sends a message (happy path)**
1. Portal Admin → project → Messages → type "The frame inspection is booked for Thursday at 10am." → Send
2. Expected: message appears in the messages list immediately
3. Expected API: `POST /api/portal/admin/builder-messages` with body `{ projectId, body: "The frame inspection..." }`
   - Note: message text goes in `body` field (not `message`)
4. Expected response: `{ ok: true, message: { id, projectId, body, sender: 'builder', sentAt, ... } }`
5. Expected DB: new row in messages table with `sender = 'builder'` (not `sender_type`), correct `project_id`
- [ ] Pass  [ ] Fail

**TC-02 — Client sees the message**
1. After TC-01, call `GET /api/portal/:token/conversations`
2. Expected: returns array including the new message with `sender: 'builder'` and the body text
- [ ] Pass  [ ] Fail

**TC-03 — Client sends a reply**
1. Call `POST /api/portal/:token/conversations` with `{ body: 'Thanks, we will be there.' }`
   - Note: client message text also goes in `body` field (not `message`)
2. Expected: HTTP 200, `{ ok: true, message: { ... } }`
3. Expected DB: new row with `sender = 'client'`
- [ ] Pass  [ ] Fail

**TC-04 — Admin sees client reply**
1. After TC-03, check the Portal Admin messages view for the project
2. Expected: the client's reply appears in the conversation thread
- [ ] Pass  [ ] Fail

**TC-05 — Missing body field rejected**
1. Call `POST /api/portal/admin/builder-messages` with no `body` field (or empty string)
2. Expected: HTTP 400 "projectId, body required"
3. Call `POST /api/portal/:token/conversations` with no `body` field
4. Expected: HTTP 400 "Message body required (max 2000 characters)."
- [ ] Pass  [ ] Fail

**TC-06 — Messages scoped to correct project**
1. Send a message for Project A
2. Call `GET /api/portal/[Project B token]/conversations`
3. Expected: Project A's message does NOT appear
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Admin can send message and it appears in client portal
- [ ] Client can reply and admin sees the reply
- [ ] Validation rejects empty message
- [ ] Messages are project-scoped
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

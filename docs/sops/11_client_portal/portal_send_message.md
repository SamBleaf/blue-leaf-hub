---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_fail
---

# SOP 11-07: Send a Message to the Client

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
- API (admin sends to client): `POST /api/portal/admin/builder-messages` — body: `{ projectId, message }`
- API (client sends to builder): `POST /api/portal/:token/conversations` — body: `{ message }`
- API (admin reads conversation): `GET /api/portal/admin/:projectId/summary` (messages included) or via portal summary
- API (client reads conversation): `GET /api/portal/:token/conversations`
- DB effects: inserts message row with `project_id`, `sender_type` ('builder' or 'client'), `message`, `sent_at`

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] A project with portal enabled exists and the portal token is known

### Test cases

**TC-01 — Admin sends a message (happy path)**
1. Portal Admin → project → Messages → type "The frame inspection is booked for Thursday at 10am." → Send
2. Expected: message appears in the messages list immediately
3. Expected API: `POST /api/portal/admin/builder-messages` returns `{ ok: true }`
4. Expected DB: new row in messages table with `sender_type = 'builder'`, correct `project_id`
- [ ] Pass  [ ] Fail

**TC-02 — Client sees the message**
1. After TC-01, call `GET /api/portal/:token/conversations`
2. Expected: returns array including the new message with `senderType: 'builder'` and the message text
- [ ] Pass  [ ] Fail

**TC-03 — Client sends a reply**
1. Call `POST /api/portal/:token/conversations` with `{ message: 'Thanks, we will be there.' }`
2. Expected: HTTP 200
3. Expected DB: new row with `sender_type = 'client'`
- [ ] Pass  [ ] Fail

**TC-04 — Admin sees client reply**
1. After TC-03, check the Portal Admin messages view for the project
2. Expected: the client's reply appears in the conversation thread
- [ ] Pass  [ ] Fail

**TC-05 — Missing message body rejected**
1. Call `POST /api/portal/admin/builder-messages` with no message field
2. Expected: HTTP 400 with plain English error
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

---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_fail
---

# SOP 11-05: Add a Client Decision Item

**Module:** Client Portal — Admin  
**SOP ID:** 11-05  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin staff and project managers who need the client to make selections or approve choices during the build.

## 2. When to use it
Any time the client needs to make a decision — colour selections, fixture choices, material upgrades, layout changes, or any item that requires client sign-off before work can proceed.

## 3. What this does
Creates a decision item in the client's portal. The client sees the question, any supporting information, and buttons to approve or reject (or make a selection). The admin can see the client's response in real time. This replaces back-and-forth emails for routine client decisions.

## 4. Before you start
- The portal is enabled for this project (SOP 11-01)
- You know what decision the client needs to make and any relevant details (options, deadline)
- You are logged in as Admin

## 5. Step-by-step process

1. Go to **Portal Admin** → select the project → click the **Decisions** tab
2. Click **+ Add Decision**
3. Fill in:
   - **Title** — e.g. "Exterior Paint Colour Selection"
   - **Description** — explain the options and what you need from the client. Include any relevant details like supplier names, colour codes, or attached documents
   - **Due date** (optional but recommended)
4. Click **Save**
5. The client can now see the decision in their portal and respond

## 6. What happens after
- A decision record is inserted into the database
- The client sees the decision in their Decisions tab with a status of "Pending"
- When the client responds (approve/reject/select), the status updates
- Admin can view the client's response in the Decisions tab in Portal Admin
- The admin receives a notification when the client responds (if notifications are configured)

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Vague decision description | Describing only from builder's perspective | Write for the client — include specific options, colour references, product names, and what happens if they don't decide by the due date |
| Not setting a due date | Seems optional | Always set a due date — decisions without deadlines get delayed |
| Adding too many decisions at once | Batch processing internally | Space decisions out — more than 3 open at once overwhelms clients |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Client cannot see the decision | Confirm the portal is enabled and the client has the correct link; preview the portal yourself (SOP 11-02) |
| Decision response not updating in admin view | Refresh the Decisions tab; if still not updating, check the client is using the correct portal URL |
| Decision title appears garbled | May be a character encoding issue — avoid special characters in the title |

## 9. Related SOPs
- [Enable the client portal for a project](portal_enable_for_client.md) — SOP 11-01
- [View the portal as the client](portal_view_as_client.md) — SOP 11-02
- [Client guide — using your portal](portal_client_guide.md) — SOP 11-09

## 10. Automation notes
- API (admin adds decision): `POST /api/portal/admin/decisions` — body: `{ projectId, title, description, dueDate? }`
- API (client responds): `POST /api/portal/:token/decisions/:decisionId/respond` — body: `{ response: 'approved' | 'rejected', note? }`
- DB effects: inserts into portal decisions table with `project_id`, `title`, `description`, `due_date`, `status = 'pending'`; client response updates `status`, `client_response`, `responded_at`
- Admin reads decisions via: `GET /api/portal/admin/:projectId/summary` (decisions included in summary)
- Client reads decisions via: `GET /api/portal/:token/decisions`

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] A project with portal enabled exists and the portal token is known

### Test cases

**TC-01 — Add a decision item (happy path)**
1. Portal Admin → project → Decisions → + Add Decision
2. Enter title "Tile Selection — Ensuite" and a description with options and due date
3. Click Save
4. Expected: decision appears in Decisions tab with status "Pending"
5. Expected DB: new row in portal decisions table with `status = 'pending'`, `project_id` correct
- [ ] Pass  [ ] Fail

**TC-02 — Client sees the decision**
1. Open `GET /api/portal/:token/decisions`
2. Expected: returns array including the new decision with `status: 'pending'`
- [ ] Pass  [ ] Fail

**TC-03 — Client approves a decision**
1. Call `POST /api/portal/:token/decisions/:decisionId/respond` with `{ response: 'approved' }`
2. Expected: HTTP 200 with `{ ok: true }`
3. Expected DB: `status = 'approved'`, `responded_at` set on the decision row
- [ ] Pass  [ ] Fail

**TC-04 — Client rejects a decision with a note**
1. Add a second decision, then call respond with `{ response: 'rejected', note: 'Would prefer Option B' }`
2. Expected: `status = 'rejected'`, `client_note` stored
- [ ] Pass  [ ] Fail

**TC-05 — Missing title rejected**
1. Attempt to create a decision with no title
2. Expected: HTTP 400 with plain English error
- [ ] Pass  [ ] Fail

**TC-06 — Responding to a decision with invalid projectId**
1. Call respond on a decision that belongs to a different project's token
2. Expected: HTTP 403 or 404 — cannot respond to another project's decision
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Decision created and visible in client portal
- [ ] Client approve and reject both update status correctly
- [ ] Client note stored on rejection
- [ ] Validation rejects missing title
- [ ] Cross-project access blocked
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

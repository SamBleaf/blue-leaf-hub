---
sop_version: 1.2
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 11-05: Add a Client Decision Item

> **LEGACY — v1 token portal (fallback only).** For new jobs use the v2 client portal — see [00_PORTAL_STACK_MATRIX.md](00_PORTAL_STACK_MATRIX.md) and SOPs 11-10..11-13. In v2, decisions are managed via the Admin Console (SOP 11-12) and the client responds on the My Actions tab (SOP 11-11). This SOP applies only to the legacy `/portal/:token` stack.

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
   - **Type** (required) — the category of decision: `selection` (client chooses a product/colour), `approval` (client approves a proposed action), or `variation` (scope change requiring sign-off)
   - **Title** (required) — e.g. "Exterior Paint Colour Selection"
   - **Description** — explain the options and what you need from the client. Include any relevant details like supplier names, colour codes, or attached documents
   - **Due date** (optional but recommended)
   - **Urgency** (optional) — flag if this is blocking site work
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
| "type required" error | The `type` field is required — choose `selection`, `approval`, or `variation` |

## 9. Related SOPs
- [Enable the client portal for a project](portal_enable_for_client.md) — SOP 11-01
- [View the portal as the client](portal_view_as_client.md) — SOP 11-02
- [Client guide — using your portal](portal_client_guide.md) — SOP 11-09

## 10. Automation notes
- API (admin creates decision): `POST /api/portal/admin/decisions`
  - Body: `{ projectId, type, title, description?, dueDate?, urgency?, costDelta?, scheduleDelta?, options? }`
  - Required: `projectId`, `type`, `title` — omitting any returns HTTP 400 "projectId, type, title required"
  - `type` values: `"selection"` | `"approval"` | `"variation"` | `"info"`
  - Response: `{ ok: true, decision: { id, projectId, type, title, description, status, ... } }`
- API (client responds): `POST /api/portal/:token/decisions/:decisionId/respond`
  - Body: `{ action: 'approve' | 'decline' | 'info', clientNote? }`
  - Note: field is `action` (not `response`); values are `'approve'`/`'decline'` (not `'approved'`/`'rejected'`)
  - `clientNote` (not `note`) stores the client's reason
  - Status after approve → `'approved'`; after decline → `'declined'` (not `'rejected'`)
  - Response: `{ ok: true }`
- DB effects: inserts into `portal_decisions` table with `project_id`, `type`, `title`, `description`, `due_date`, `status = 'pending'`; client response updates `status`, `client_note`, `responded_at`
- Admin reads decisions via: `GET /api/portal/admin/:projectId/summary` (decisions included in summary)
- Client reads decisions via: `GET /api/portal/:token/decisions`

## 11. Screenshot placeholders
[insert screenshot: Portal Admin Decisions tab with + Add Decision form open]
[insert screenshot: Client portal Decisions tab showing a pending decision]

## 12. Edge cases and limits
- The `type` field must be one of `"selection"` / `"approval"` / `"variation"` / `"info"` — any other value returns 400
- `options` is an optional JSON array for selection-type decisions; not used for `approval` or `variation`
- `costDelta` and `scheduleDelta` are only meaningful for `type = "variation"` — they are stored but not displayed for other types
- A declined decision cannot be re-opened; create a new decision to re-raise
- There is no draft/preview step — the decision is immediately visible to the client once saved
- Multiple decisions can be open simultaneously; no enforced limit per project
- `urgency` is a UI flag only; no system enforcement or notification fires based on urgency

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] A project with portal enabled exists and the portal token is known

### Test cases

**TC-01 — Add a decision item (happy path)**
1. Portal Admin → project → Decisions → + Add Decision
2. Enter:
   - type = "selection"
   - title = "Tile Selection — Ensuite"
   - description = "Choose between Option A (marble look) and Option B (slate grey)"
   - dueDate = 2 weeks from today
3. Click Save
4. Expected: decision appears in Decisions tab with status "Pending"
5. Expected API: `POST /api/portal/admin/decisions` returns `{ ok: true, decision: { id, type, title, status: 'pending', ... } }`
6. Expected DB: new row in `portal_decisions` with `type = 'selection'`, `status = 'pending'`, `project_id` correct
- [ ] Pass  [ ] Fail

**TC-02 — Client sees the decision**
1. Open `GET /api/portal/:token/decisions`
2. Expected: returns array including the new decision with `status: 'pending'`
- [ ] Pass  [ ] Fail

**TC-03 — Client approves a decision**
1. Call `POST /api/portal/:token/decisions/:decisionId/respond` with `{ action: 'approve' }`
   - Note: field is `action` (not `response`), value is `'approve'` (not `'approved'`)
2. Expected: HTTP 200 with `{ ok: true }`
3. Expected DB: `status = 'approved'`, `responded_at` set on the decision row
- [ ] Pass  [ ] Fail

**TC-04 — Client declines a decision with a note**
1. Add a second decision, then call respond with `{ action: 'decline', clientNote: 'Would prefer Option B' }`
   - Note: field is `action: 'decline'` (not `response: 'rejected'`); note field is `clientNote`
2. Expected: `status = 'declined'` (not `'rejected'`), `client_note` stored in DB
- [ ] Pass  [ ] Fail

**TC-05 — Missing required fields rejected**
1. Attempt to create a decision with no title → Expected: HTTP 400
2. Attempt to create with no type → Expected: HTTP 400 "projectId, type, title required"
3. Attempt to create with no projectId → Expected: HTTP 400
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

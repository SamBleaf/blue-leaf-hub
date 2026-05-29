---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_fail
---

# SOP 11-06: Add a Variation in the Portal

**Module:** Client Portal — Admin  
**SOP ID:** 11-06  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin staff and project managers who need to formally notify the client of a variation (a change to the scope of work) and record their approval or rejection.

## 2. When to use it
Any time the scope of work changes from the original contract — client-requested additions, design changes, site conditions that add cost, or builder-initiated changes that affect price or timeline.

## 3. What this does
Creates a variation/claim record in the client's portal. The client can see the description, amount, and reason. They can approve or reject from within their portal. The admin sees the response immediately. This creates a clear paper trail for all variations.

## 4. Before you start
- The portal is enabled for this project (SOP 11-01)
- You have the variation description, amount (ex-GST), and reason for the change
- The variation has been discussed verbally with the client if appropriate

## 5. Step-by-step process

1. Go to **Portal Admin** → select the project → click the **Variations** (or Claims) tab
2. Click **+ New Claim**
3. Fill in:
   - **Description** — what is changing and why (plain English)
   - **Amount** — the variation cost in dollars (ex-GST)
   - **Reason / type** — e.g. "Client-requested change", "Latent conditions", "Design change"
4. Click **Save**
5. The client sees the variation in their portal under the Budget tab or Variations section

## 6. What happens after
- A claim record is inserted into the database with status "Pending"
- The client sees the variation and can approve or reject it
- When the client responds, the admin sees the updated status
- Approved variations contribute to the client's budget overview total

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Vague description | Copied from internal shorthand | Write for the client — describe what is actually changing in plain language they can understand |
| Entering the wrong amount | GST confusion | Enter ex-GST only — the portal displays GST separately to the client |
| Creating a variation without discussing it first | Admin-only workflow | Always call or message the client before formally submitting the variation in the portal — surprises cause disputes |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Variation not appearing in client portal | Check the portal is enabled; preview the portal (SOP 11-02) to confirm |
| Amount appears wrong in client view | Confirm ex-GST was entered — the portal adds GST for display |
| Client rejected a variation but admin needs to re-raise | Create a new claim with updated description and amount |

## 9. Related SOPs
- [Enable the client portal for a project](portal_enable_for_client.md) — SOP 11-01
- [Add a client decision item](portal_add_decision.md) — SOP 11-05
- [Client guide — using your portal](portal_client_guide.md) — SOP 11-09

## 10. Automation notes
- API: `POST /api/portal/admin/claims` — body: `{ projectId, description, amount, reason? }`
- Amount stored and returned ex-GST
- DB effects: inserts into portal claims/variations table with `project_id`, `description`, `amount`, `reason`, `status = 'pending'`, `created_at`
- Client views variations via `GET /api/portal/:token/budget` (included in budget overview)
- Admin reads via `GET /api/portal/admin/:projectId/summary`

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] A project with portal enabled exists

### Test cases

**TC-01 — Create a variation/claim (happy path)**
1. Portal Admin → project → Variations → + New Claim
2. Enter description "Additional power points — living room", amount 450, reason "Client-requested change"
3. Click Save
4. Expected: claim appears in variations list with status "Pending"
5. Expected DB: new row in claims table with `status = 'pending'`, `amount = 450`
- [ ] Pass  [ ] Fail

**TC-02 — Variation appears in client budget view**
1. After TC-01, call `GET /api/portal/:token/budget`
2. Expected: the variation appears in the response with amount and status
- [ ] Pass  [ ] Fail

**TC-03 — Missing description rejected**
1. Call `POST /api/portal/admin/claims` with no description
2. Expected: HTTP 400 with plain English error
- [ ] Pass  [ ] Fail

**TC-04 — Missing amount rejected**
1. Call `POST /api/portal/admin/claims` with no amount
2. Expected: HTTP 400 with plain English error
- [ ] Pass  [ ] Fail

**TC-05 — Amount stored ex-GST**
1. Create a claim with amount 1000
2. Expected DB: `amount = 1000` (not 1100)
3. Expected: client view shows the amount with GST addition noted separately
- [ ] Pass  [ ] Fail

**TC-06 — Multiple claims stack in budget view**
1. Create a second claim for the same project
2. Call `GET /api/portal/:token/budget`
3. Expected: both claims appear and total is sum of both amounts
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Claim created and visible in client portal budget view
- [ ] Validation rejects missing description and amount
- [ ] Amount stored ex-GST
- [ ] Multiple claims stack correctly
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

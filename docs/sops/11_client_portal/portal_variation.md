---
sop_version: 1.2
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 11-06: Add a Variation in the Portal

> **LEGACY — v1 token portal (fallback only).** For new jobs use the v2 client portal — see [00_PORTAL_STACK_MATRIX.md](00_PORTAL_STACK_MATRIX.md) and SOPs 11-10..11-13. In v2, variations are issued from the finance/admin layer and the client approves or declines them on the My Actions tab (SOP 11-11), which archives an approved PDF automatically. This SOP applies only to the legacy `/portal/:token` stack.

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

1. Go to **Portal Admin** → select the project → click the **Decisions** tab
2. Click **+ Add Decision**
3. Fill in:
   - **Type** — set to `variation` (this is what distinguishes a scope variation from a selection or approval decision)
   - **Title** (required) — a short description of the change, e.g. "Additional power points — living room"
   - **Description** — detailed explanation of what is changing and why (plain English)
   - **Cost delta** — the cost change in dollars (ex-GST). Positive = increase, negative = decrease
   - **Schedule delta** — the number of days the change adds or removes from the program
   - **Due date** (optional but recommended)
4. Click **Save**
5. The client sees the variation in their portal under the **Budget** tab in the Variations section

## 6. What happens after
- A decision record of type `variation` is inserted into `portal_decisions` with status `"pending"`
- The client sees the variation in their portal and can approve or decline it
- Client responds via `POST /api/portal/:token/decisions/:decisionId/respond` with `{ action: 'approve' | 'decline', clientNote? }`
- When the client responds, status changes to `'approved'` or `'declined'`; the admin sees the updated status immediately
- Approved variations with a `costDelta` contribute to the client's budget overview total in the Budget tab

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
| Amount appears wrong in client view | Confirm ex-GST was entered as `costDelta` — the portal adds GST for display |
| Client declined a variation but admin needs to re-raise | Create a new decision (type: variation) with updated title and costDelta |
| Variation not appearing in budget section | Confirm the decision type is `"variation"` — `selection` and `approval` types do not appear in the budget tab |

## 9. Related SOPs
- [Enable the client portal for a project](portal_enable_for_client.md) — SOP 11-01
- [Add a client decision item](portal_add_decision.md) — SOP 11-05
- [Client guide — using your portal](portal_client_guide.md) — SOP 11-09

## 10. Automation notes
- API: `POST /api/portal/admin/decisions` — body: `{ projectId, type: "variation", title, description?, costDelta?, scheduleDelta?, dueDate? }`
  - Required: `projectId`, `type`, `title`
  - `type` MUST be `"variation"` — do NOT use `portal_claims` for scope variations (that table is for the payment schedule only)
  - `costDelta` — ex-GST dollar amount of the cost change (positive = cost increase, negative = saving)
  - `scheduleDelta` — integer days added to the programme (positive = delay)
  - Response: `{ ok: true, decision: { id, projectId, type: 'variation', title, status: 'pending', costDelta, scheduleDelta, ... } }`
- Client responds: `POST /api/portal/:token/decisions/:decisionId/respond` — body: `{ action: 'approve' | 'decline', clientNote? }`
- DB table: `portal_decisions` (type = `'variation'`) — NOT `portal_claims`
  - `portal_claims` is for the progress payment schedule (Deposit/Slab/Frame/Lockup/Handover) — entirely different
- Client views variations via `GET /api/portal/:token/budget` — variations come from `portal_decisions WHERE type = 'variation'`
- Admin reads via `GET /api/portal/admin/:projectId/summary`

## 11. Screenshot placeholders
[insert screenshot: Portal Admin Decisions tab with + Add Decision set to type variation]
[insert screenshot: Client portal Budget tab showing the pending variation with cost inc-GST]

## 12. Edge cases and limits
- Scope variations use `portal_decisions` (type `"variation"`) — never `portal_claims`; `portal_claims` is for the progress payment schedule only (Deposit/Slab/Frame/Lockup/Handover)
- `costDelta` is stored and displayed ex-GST; the portal adds GST for the client view — always enter the ex-GST figure
- `scheduleDelta` is a signed integer (days); positive = delay, negative = saving
- A declined variation cannot be re-opened; create a new decision with type `"variation"` to re-raise
- There is no audit log for v1 variation responses; only the DB status change is recorded
- Variations only appear in the client Budget tab when `type = "variation"` — other decision types do not flow into budget
- `costDelta` may be `null` for non-cost variations; the budget total excludes null `costDelta` rows

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] A project with portal enabled exists

### Test cases

**TC-01 — Create a variation (happy path)**
1. Portal Admin → project → Decisions → + Add Decision
2. Send: `POST /api/portal/admin/decisions` with body:
   ```json
   { "projectId": "<id>", "type": "variation", "title": "Additional power points — living room", "description": "Client-requested change — 4 additional GPOs in living room", "costDelta": 450 }
   ```
3. Expected: `{ ok: true, decision: { id, type: 'variation', title: '...', status: 'pending', costDelta: 450 } }`
4. Expected DB: new row in `portal_decisions` with `type = 'variation'`, `status = 'pending'`, `cost_delta = 450`
- [ ] Pass  [ ] Fail

**TC-02 — Variation appears in client budget view**
1. After TC-01, call `GET /api/portal/:token/budget`
2. Expected: the variation appears in the `variations` array with `costDelta = 450` and `status = 'pending'`
3. Expected: NOT in the `claims` array (which is the payment schedule)
- [ ] Pass  [ ] Fail

**TC-03 — Missing required fields rejected**
1. Call `POST /api/portal/admin/decisions` with `type: "variation"` but no title → Expected: HTTP 400
2. Call with no `type` at all → Expected: HTTP 400 "projectId, type, title required"
3. Confirm: `portal_claims` endpoint does NOT accept `description` as the variation format
- [ ] Pass  [ ] Fail

**TC-04 — Client approves a variation**
1. Use the decision ID from TC-01
2. Call `POST /api/portal/:token/decisions/:decisionId/respond` with `{ action: 'approve' }`
3. Expected: `{ ok: true }` — status changes to `'approved'`
4. Expected DB: `status = 'approved'`, `responded_at` set
- [ ] Pass  [ ] Fail

**TC-05 — costDelta stored ex-GST**
1. Create a variation with `costDelta: 1000`
2. Expected DB: `cost_delta = 1000` (ex-GST, not 1100)
3. Expected: client view shows the amount with GST addition noted separately
- [ ] Pass  [ ] Fail

**TC-06 — Multiple variations stack in budget view**
1. Create a second variation for the same project with `costDelta: 250`
2. Call `GET /api/portal/:token/budget`
3. Expected: both variations appear; total variations cost = 1250 (sum of both `costDelta` values)
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Variation created via `portal_decisions` (not `portal_claims`)
- [ ] `type = 'variation'` is required and distinguishes from selection/approval
- [ ] Variation visible in client portal budget view under variations section
- [ ] Validation rejects missing type and title
- [ ] `costDelta` stored ex-GST
- [ ] Client can approve or decline via `action: 'approve'` / `action: 'decline'`
- [ ] Multiple variations stack correctly
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

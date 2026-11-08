---
sop_version: 1.0
last_reviewed: 2026-11-07
app_version: master-register-r02 (R03, not deployed)
screenshot_status: placeholders_only
owner: Director / Project manager
test_status: untested
---

# SOP: Review the register — decisions, technical checks, pricing links and the client portal

**Module:** Sales → Lead → Project brief & register → Register
**SOP ID:** 21-02
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Director, project manager, estimator, office staff.

## 2. When to use it
In the office after a client meeting, before issuing a brief, before tender, and whenever a consultant or supplier document changes something.

## 3. What this does
The **Register** step is the office view of every item captured onsite. Each item has four separate answers, never mixed into one status:
- **Decision** (client): Not discussed · Preference · Proposed · Client-approved
- **Technical**: Not required · Needs verification · Verified
- **Pricing**: Not reviewed · Allowance or estimate · Quoted and reviewed (a link to the estimate line — never a price)
- **Scope**: New · Included · Alter · Existing to remain · Remove / demolish · Make good · By others · Excluded · Deferred / future · N/A · Undecided

A client can approve a window choice while the window still needs a technical check — both show. You decide which items the client sees in the portal; nothing is shown to the client automatically.

## 4. Before you start
- The brief has been captured (see 21-01).
- Portal actions appear only once the project record exists (badge **Project record**). Before that, selections are saved on the lead and cannot be issued.
- Admin staff role.

## 5. Step-by-step process

1. Open the lead → **Project brief & register** → **Register**.
2. Leave **Outstanding only** ticked to see what still needs work. The line above the filters counts items, decisions, checks to verify and open actions.
3. Narrow the list with the filters: room, type, category, scope status, decision, verification, pricing, owner (and portal state once there is a project record). Search finds a description, product, model, supplier, next action or reference code (e.g. `K005-8HY`).
4. For each row:
   1. Read **Item / direction** (the type and category show underneath).
   2. Set **Scope** in the dropdown.
   3. Check the **Status** column — decision, *Tech:* and *Price:* lines.
   4. Choose the **owner** and type the **next action** (for example "Architect to confirm peninsula clearance").
   5. Click **Edit** for the full row: product, model, supplier, quantity, finish, technical verification, pricing link and source (drawing sheet / document).
5. **Technical check:** when a drawing or consultant document confirms an item, set Technical to **Verified** and fill **Record what verified it (drawing / consultant document)**. Without a reference it is flagged.
6. **Pricing:** choose **Allowance or estimate** or **Quoted and reviewed** and paste the estimate line / RFQ / quote reference into **Pricing (link — never a price)**.
7. **Add a coordination check** (architect, engineer, windows, energy): at the bottom choose **Choose a coordination check…** and click **Add**. It becomes an owned action, never a client question.
8. **Release choices to the client portal** (project record only):
   1. Tick the selections to release, then click **Issue to client portal** above the table — or use **Issue to client portal** on one item in the room view.
   2. To take one back, click **Withdraw from portal** (not possible once the client has approved it).
   3. When the client makes a choice in the portal, the item shows **Client chose — review**. Click **Approve** to record it as Client-approved (evidence: portal choice), or **Return to client** with a note.

> 💡 **Tip:** "Staged (internal)" means the client cannot see it. Only items you issue appear in the portal.

[insert screenshot: Register step with Outstanding only and filters]
[insert screenshot: row editor (Edit) with technical and pricing fields]
[insert screenshot: Issue to client portal with two selections ticked]

## 6. What happens next
- Every change is saved to the project's canonical records (no "sync" button) and logged in the job history.
- Issued items appear in the client portal. A client approval or your **Approve** records who, when and how.
- Once the building contract is signed, approved selections are locked: changes go through a variation (see 21-04).

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Treating "Verified" as the client's approval | One status used to mean both | Decision and Technical are separate — set both |
| Typing a dollar figure into a note or pricing link | Habit | Links only; the pre-issue check blocks $ figures in documents |
| Issuing every selection to the portal at once | Wanting the client to "see everything" | Issue only items ready for the client to choose |
| Changing an approved product and forgetting to re-confirm | Quick edit | The item steps back to **Proposed** with a notice — get the client's re-approval and record it |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| No **Issue to client portal** button | Still a lead brief (no project record) or nothing staged | Create the job first; only staged selections can be issued |
| "… changed after client approval — it's back to Proposed until the client re-confirms" | You changed the product, model, manufacturer or finish of an approved choice | Record the client's re-approval |
| "… is approved under the signed contract — change it through a variation" | Contract signed / item ordered or installed | Raise a variation |
| "… is on the client portal — withdraw it before deleting or re-classifying" | Item is live in the portal | Withdraw it first (not possible once approved) |
| "An item changed elsewhere since you opened it. Nothing was saved." | Someone else saved the same item | The card reloads that item; re-check it and save again |

## 9. Related modules
- [21-01 Capture the project brief](21-01_capture_project_brief.md)
- [21-03 Issue briefs and the selections schedule](21-03_issue_briefs_and_schedule.md)
- [11 Client portal SOPs](../11_client_portal/) — what the client sees

## 10. Screenshot placeholders
[insert screenshot: Status column showing decision / Tech / Price lines]
[insert screenshot: Client chose — review with Approve / Return to client]

## 11. Automation notes
- Writes go through `PUT /api/register/leads/:leadId` → `register_apply` (one transaction; on any conflict nothing is written and the conflicting items are returned).
- Choices: `client_selections` (`certainty`, `technical_status`, `pricing_status`, `pricing_ref`, `approval_evidence`, `client_visible`); scope, requirements and actions: `room_scope_items`.
- Portal: `POST /api/register/leads/:leadId/portal/issue|withdraw|return`. Issuing sets `client_visible = true`; the existing portal notification (if enabled) is the only client communication. No new client invitation is created.
- Every change writes a `job_events` row (`register.item.updated`, `register.item.issued`, `register.item.withdrawn`, `register.item.returned`).

## 12. Edge cases and limits
- Two people approving the same item: the second sees a conflict and nothing is overwritten.
- Withdraw is refused for a client-approved item ("approved_locked").
- Deferred, Excluded, By others and N/A selections are scope answers, not client choices — they never appear in the client's selections list.
- Quantity blank = not measured; it is never shown as 0.

## 13. Owner of the process
Director / Project manager
Next review date: 2027-05-07

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Run against the local register sandbox, never production.

### Pre-test setup
- [ ] Sandbox running; signed in as sandbox staff
- [ ] A lead converted to a job, with at least 3 selections promoted (badge **Project record**)
- [ ] A sandbox portal client user linked to that project

### Test cases

**TC-01 — Happy path (standard use)**
1. Register → set one selection Technical **Verified** with reference "A-201 Rev C", Pricing **Allowance or estimate** with link "EST-14".
2. Expected result: Status column shows "Tech: verified" and "Price: allowance or estimate · EST-14".
3. Expected DB record: `client_selections.technical_status = 'verified'`, `technical_evidence` holds the reference, `pricing_ref = 'EST-14'`.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. Set Technical **Verified** on an item with the reference left blank, save.
2. Expected result: refused — "needs a technical reference before it can be marked verified"; the item stays Needs verification.
3. Expected DB: unchanged.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission**
1. Tick two staged selections, click **Issue to client portal** twice quickly.
2. Expected result: both items issued once; the second click does nothing harmful.
3. Expected DB: two `register.item.issued` events, not four.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. As the portal client, call `GET /api/register/leads/:id`.
2. Expected result: 403 Forbidden. In the portal the client sees only issued items.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification**
1. Issue one selection; as the portal client choose an option; as staff click **Approve**.
2. Check: `client_selections.client_visible = true`, `certainty = 'client_approved'`, `approval_evidence.method = 'portal_choice'`.
3. Check: `job_events` rows for issued and updated.
4. Check: no new `project_client_users` invitation was created.
- [ ] Pass  [ ] Fail

**TC-06 — Re-approval rule**
1. In the app, change the product of a client-approved selection.
2. Expected: notice "… back to Proposed until the client re-confirms"; DB `certainty = 'proposed'`, `approval_evidence` null.
3. Via the API, send the same product change with `certainty` still `client_approved` and no new evidence.
4. Expected: 409 with reason `reapproval_required`; nothing written.
- [ ] Pass  [ ] Fail

**TC-07 — Separate axes (Tab 23 test E)**
1. Approve a glazing selection that still needs technical verification.
2. Expected: decision "Client-approved" AND "Tech: needs verification"; the item stays in **Outstanding only**.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

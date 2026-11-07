---
sop_version: 1.0
last_reviewed: 2026-11-07
app_version: master-register-r02 (R03, not deployed)
screenshot_status: placeholders_only
owner: Director
test_status: untested
---

# SOP: Tender summary, contract baseline and handover to Operations

**Module:** Sales → Lead → Project brief & register → Tender / Handover
**SOP ID:** 21-04
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Director, estimator (tender summary); Director only for recording the contract baseline.

## 2. When to use it
- **Tender** step (Consultants, Tender and Won stages): before pricing is finalised, to see what is in, out, by others, still undecided, and what still needs a price link.
- **Handover** step (Won stage, or as soon as the building contract is recorded as signed): to record the contract baseline and release remaining selections to the client.

## 3. What this does
The **Tender** step reads the same register rows and shows the scope boundary for pricing — it never calculates or shows prices; it links to the existing estimate (PC / PS labels only). The **Handover** step lets the director record the **contract baseline**: a permanent snapshot of the agreed scope, selections, exclusions, drawing basis, reviewed allowances and issued documents. After that, approved selections change only through variations, and the Operations team works from the same records — no re-typing and no second project.

## 4. Before you start
- The lead is at Consultants, Tender or Won (Tender step), or the building contract is recorded as **Signed** (Handover step).
- A project record exists (the brief has been promoted — see 21-01).
- Won still requires the signed contract **and** an explicit staff action. Nothing in this SOP moves the stage by itself.

## 5. Step-by-step process

**Tender summary**
1. Open the lead → **Project brief & register** → **Tender**.
2. Read the sections: **Included work**, **Excluded / deferred**, **By others / client supplied**, **Unresolved — decide before pricing is final**, **Products specified**, **Needs pricing — link to the existing estimate**, **Technical risks to verify**.
3. For each item under **Needs pricing**, go to the Register (21-02) and add its estimate / RFQ / quote link. When every in-scope item has a reviewed price source, the section says so.
4. Click **Refresh** after changes.

**Contract baseline and handover**
5. Open **Handover** (shown once the contract is signed, or at Won).
6. Check the tiles: **Building contract** (Signed), **Project record**, **Contract baseline** (Not recorded).
7. Under **1 · Record the contract baseline**, read what will be captured, then click **Record contract baseline & hand over**.
8. The message confirms the baseline number (B01) and how many scope items, selections, exclusions and open items were carried forward.
9. Under **2 · Release selections to the client portal**, tick the selections the client should now see and click **Release N to the client portal**. No new client invitation is sent.
10. Later changes appear as **Changed since contract** or **Added after contract**. If the scope changes materially, click **Record a new baseline revision** (B02) after the variation is agreed.

> 💡 **Tip:** The baseline is permanent. Record it only when the signed contract is final.

[insert screenshot: Tender step sections]
[insert screenshot: Handover tiles before the baseline]
[insert screenshot: baseline recorded message and Changed since contract chip]

## 6. What happens next
- The baseline is stored as an immutable `register_baseline` document (B01, B02 …) with a checksum.
- The Ops-Ready checklist item **selections transfer** is ticked for the Won handoff.
- Operations sees the same project record — open items carried forward keep their owner and next action.
- Approved selections are locked; changing one needs a variation.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Recording the baseline before the contract is signed | Wanting to "lock it in" | The button refuses until the contract is recorded as Signed |
| Treating the Tender summary as the price | It lists allowances | It only shows labels and links — pricing lives in the estimate / fee proposal |
| Releasing everything to the portal at handover | Default habit | Release only the selections the client should act on |
| Expecting Won to happen automatically | Baseline recorded | Won still needs the explicit stage action in Sales |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| No **Handover** step | Not at Won and contract not recorded as Signed | Record the signed contract in the Won / contract area first |
| "Available once the building contract is recorded as signed." | Contract status not Signed | Update the contract status |
| "The brief must be on the project record first …" | Brief not yet promoted (no job) | Create the job; the brief moves automatically |
| **Needs pricing** never empties | Items without a pricing link | Add links in the Register (Pricing (link — never a price)) |
| "Building the tender view…" stays | Slow connection / server busy | Click **Refresh**; check the API is running |

## 9. Related modules
- [21-02 Review the register](21-02_register_review_approvals_portal.md)
- [21-03 Issue briefs and the selections schedule](21-03_issue_briefs_and_schedule.md)
- [02-22 Tender stage](../02_sales/02-22_tender_stage.md) · [02-23 Won → Operations handoff](../02_sales/02-23_won_ops_handoff.md)

## 10. Screenshot placeholders
[insert screenshot: Products specified and Technical risks to verify]
[insert screenshot: Release N to the client portal]

## 11. Automation notes
- Tender: `GET /api/register/leads/:leadId/tender` (read-only; cost references are labels from fee proposal categories / PC & PS items, never amounts).
- Baseline: `POST /api/register/leads/:leadId/baseline` → requires `contract_status = 'signed'` and a project record; writes a `register_baseline` row through `register_issue_document` (versioned, immutable); sets the Ops-Ready `selections_transfer` item; writes `job_events` `register.baseline.recorded`.
- Release: the same staff-initiated portal issue action as 21-02. No client invitation or email is created by the baseline.

## 12. Edge cases and limits
- Recording the baseline twice creates B02 and supersedes B01 — never overwrites it.
- Won does not create a second project: the same project record graduates to Operations.
- Items added after the baseline are flagged **Added after contract** until a new baseline revision is recorded.
- Ordered and installed items are locked regardless of baseline.

## 13. Owner of the process
Director
Next review date: 2027-05-07

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Run against the local register sandbox, never production.

### Pre-test setup
- [ ] Sandbox running; signed in as sandbox staff
- [ ] A lead with a job/project record, a mix of included, excluded, by-others and undecided items, at stage Tender
- [ ] A way to set `contract_status = 'signed'` on the lead (contract area in the Won stage)

### Test cases

**TC-01 — Happy path (standard use)**
1. Tender step: check every section lists the right items.
2. Set contract Signed → Handover → **Record contract baseline & hand over**.
3. Expected result: "Contract baseline B01 recorded — …" message; tile shows B01 with today's date.
4. Expected DB record: `lead_documents` `document_type = 'register_baseline'`, `version = 1`, `status = 'current'`; `leads.ops_ready_checklist.selections_transfer = true`.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field (contract not signed)**
1. With `contract_status` not Signed, call `POST /api/register/leads/:id/baseline`.
2. Expected result: 409 `CONTRACT_NOT_SIGNED` — "Record the signed building contract first …"; the Handover step is not shown in the app.
3. Expected DB: no `register_baseline` row.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission**
1. Click **Record a new baseline revision** after TC-01.
2. Expected result: B02 is current; B01 is Superseded; both rows exist.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. As a portal client JWT call `GET /api/register/leads/:id/tender` and `POST /baseline`.
2. Expected result: 403 for both.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification**
1. After TC-01, check `job_events` for `register.baseline.recorded`.
2. Check: no new `project_client_users` row and no email in the mail log.
3. Check: one project row for the job (no duplicate on Won).
- [ ] Pass  [ ] Fail

**TC-06 — Post-contract lock**
1. After the baseline, try to change the product of an approved selection.
2. Expected: refused — "… approved under the signed contract — change it through a variation"; operational notes on the same item can still be saved.
- [ ] Pass  [ ] Fail

**TC-07 — No prices in the tender view**
1. Open the Tender step on a lead whose fee proposal has PC / PS items.
2. Expected: labels such as "PC sum — tapware" appear; no dollar amount appears anywhere in the step or its API response.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

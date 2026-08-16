---
sop_version: 1.0
last_reviewed: 2026-08-16
app_version: main
screenshot_status: placeholders_only
owner: Sales (Admin / Director)
test_status: untested
---

# SOP: Select the designer and set the concept & design fees

**Module:** Sales
**SOP ID:** 02-14
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Admin, Supervisor.

## 2. When to use it
At the **Discovery** stage, after the meeting, once you've decided which designer/consultant suits the project.

## 3. What this does
Records the recommended designer on the lead and auto-fills the client-facing **concept fee** and **full-design fee** from that designer's defaults (editable per lead). These flow into the discovery email and the concept agreement.

## 4. Before you start
- The lead is at **Discovery**.
- Migrations **179 + 180** applied.
- The designer exists as a **CRM contact** typed *architect* or *designer*, with a **company** and **default fees** set.

## 5. Step-by-step process
1. Open the Discovery-stage lead → the **Designer & fees** panel.
2. Choose the designer from the dropdown. Their default concept + design fees auto-fill (if the lead's fees were already set, you'll be asked before overwriting).
3. Adjust either fee if needed — enter the **ex-GST** amount; the panel shows what the client will see **inc GST**.

> 💡 **Tip:** Fees are stored ex-GST but the client always sees the inc-GST price — so a $500-inc concept fee is entered as its ex-GST value.

[insert screenshot: the Designer & fees panel with a designer selected]

## 6. What happens next
The designer + fees autofill the discovery email (SOP 02-15) and the concept agreement (SOP 02-16). The selection is also recorded as a lead-scoped contact role.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| No designers in the dropdown | None typed architect/designer, or migration 180 not applied | Add a CRM contact typed architect/designer with default fees. |
| Entering inc-GST in the fee box | Client price is inc-GST | Enter the **ex-GST** figure — the panel shows the inc-GST the client sees. |

## 8. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| "Couldn't set the designer" | Migration 179/180 not applied | Apply migrations 179 + 180. |
| Fees didn't autofill | The designer has no default fees | Set default_concept_fee / default_design_fee on the CRM contact. |

## 9. Related modules
- [Send the Discovery email](02-15_discovery_email.md) → uses the designer + fees
- [Generate + accept the concept agreement](02-16_concept_agreement.md) → uses the fees

## 10. Screenshot placeholders
[insert screenshot: dropdown of designers]
[insert screenshot: fees autofilled inc-GST hint]

## 11. Automation notes
- Select → `POST /api/sales/leads/:id/designer` sets `leads.selected_designer_contact_id`, autofills `concept_fee`/`design_package_fee` (ex-GST) from the CRM contact's defaults, and upserts a `job_contact_roles` row (lead-scoped, role=designer).
- Fee edits → the blanket `PATCH /api/sales/leads/:id`.

## 12. Edge cases and limits
- Overwrite on designer change only happens if you confirm.
- The admin-only "cost we pay" (`job_contact_roles.fee_amount`) is never shown here.
- Before migration 179/180 the panel loads but selecting a designer errors.

## 13. Owner of the process
Sales (Admin / Director). Next review: 2027-02-16

---

## 14. Troubleshoot Agent Test Script

> Requires migrations 179 + 180. Admin session.

### Pre-test setup
- [ ] Admin.
- [ ] A CRM contact typed "designer", company + default fees set.
- [ ] A discovery-stage lead.

### Test cases
**TC-01 — Happy path** Select the designer → fees autofill; `leads.selected_designer_contact_id` + `concept_fee` + `design_package_fee` set. [ ] Pass [ ] Fail
**TC-02 — Empty** POST `/designer` with no contactId → 400 "contactId is required". [ ] Pass [ ] Fail
**TC-03 — Overwrite guard** With fees already set, pick a different designer without overwrite → fees unchanged; with overwrite:true → fees replaced. [ ] Pass [ ] Fail
**TC-04 — Wrong role** Non-admin GET `/api/sales/designers` → 403. [ ] Pass [ ] Fail
**TC-05 — Automation** After select, `job_contact_roles` has a lead-scoped role=designer row; `fee_amount` is NOT returned by `/api/sales/designers`. [ ] Pass [ ] Fail
**TC-06 — inc-GST display** A concept_fee stored ex-GST renders as the correct inc-GST value in the panel + email. [ ] Pass [ ] Fail

### Post-test checklist
- [ ] All passed · [ ] No console/network errors · [ ] DB values correct · [ ] Update test_status · [ ] Changelog entry

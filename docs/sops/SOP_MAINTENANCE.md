# SOP Maintenance Guide — Blue Leaf Hub

---

## Purpose of SOPs in this system

Every SOP serves two purposes simultaneously. Both must be addressed in every file.

**Purpose 1 — Staff training**
Plain-English, step-by-step instructions that a new team member with no prior experience can follow to complete a task correctly. Assume the reader knows nothing about the software. Use numbered steps, not paragraphs. Screenshots at each major step.

**Purpose 2 — Troubleshoot agent testing**
Section 14 (Troubleshoot Agent Test Script) of every SOP is a structured test checklist. The troubleshoot agent reads this section and executes every test step to verify the feature works as intended, catches bugs, checks edge cases, and confirms database records are created correctly. Without this section, a feature is considered unverified.

**Build rule (mandatory):**
A module is not considered "done" until all SOPs for that module are written and contain a complete Section 14. Writing SOPs is part of the build — not a post-build task.

---

## Run SOP Audit

**Trigger phrase:** "Run SOP audit"

When this phrase is used, Claude Code will:

1. Scan the current app structure (src/pages/, src/components/, server/lib/, App.jsx routes)
2. Compare findings against SOP_INDEX.md
3. Identify every gap or change (see checklist below)
4. Update changed SOPs with new steps
5. Create new SOP files for missing workflows
6. Flag screenshot placeholders that need replacement (UI changed)
7. Update SOP_INDEX.md (status, new entries, removed entries)
8. Add entries to SOP_CHANGELOG.md
9. Output a final summary report of all changes made

---

## What the audit checks

1. **New modules without SOPs** — a new page or section has no SOP file
2. **New workflows without SOPs** — a new button, form, or action has no SOP
3. **Changed buttons or actions** — a button has been renamed, moved, or removed
4. **Renamed pages** — a module has a new name or route
5. **Removed features** — a workflow no longer exists (move its SOP to archive/)
6. **SOPs with outdated steps** — the process has changed since last review
7. **Screenshots that need replacing** — the UI has visually changed
8. **Broken links** — internal links between SOPs point to missing files
9. **Missing role permissions** — a new role has been added and SOPs haven't been updated
10. **Missing troubleshooting notes** — a known problem has no documented fix

---

## How to update a single SOP

When a feature changes:

1. Open the relevant SOP file (find it in SOP_INDEX.md)
2. Update the step-by-step process to match the new workflow
3. Update the version number at the top (e.g. 1.0 → 1.1)
4. Change `last_reviewed` to today's date
5. If the UI changed visually, set `screenshot_status: needs_replacement`
6. Add an entry to SOP_CHANGELOG.md

---

## How to add a new SOP

When a new feature is added (this is a build requirement — must be done before the feature is considered shipped):

1. Create a new markdown file in the correct module folder (e.g. `09_finance/finance_new_feature.md`)
2. Use the SOP template (see below) — complete ALL sections including Section 14
3. Section 14 (Troubleshoot Agent Test Script) must contain at minimum TC-01 through TC-05 and at least one feature-specific test case. No exceptions.
4. Add a row to SOP_INDEX.md with the new SOP ID, name, file path, module, role, status (Draft), test_status (untested), screenshots required, and priority
5. Add an entry to SOP_CHANGELOG.md
6. The troubleshoot agent should be run against Section 14 before the feature is marked as verified

---

## How to retire a SOP

When a feature is removed:

1. Move the SOP file to `archive/` folder
2. Update SOP_INDEX.md — change status to `Archived`
3. Add an entry to SOP_CHANGELOG.md

---

## SOP template

Copy this template when creating a new SOP file:

```markdown
---
sop_version: 1.0
last_reviewed: YYYY-MM-DD
app_version: main
screenshot_status: placeholders_only
owner: [Role Name]
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP: [Title]

**Module:** [Module Name]  
**SOP ID:** [XX-YY]  
**Status:** Draft  
**Priority:** High / Medium / Low

---

## 1. Who uses this
[List of roles — e.g. Admin, Staff, Director]

## 2. When to use it
[Describe the trigger — when would someone need this SOP? What prompts them to open this screen?]

## 3. What this does
[Plain English summary of the outcome. No technical language. One paragraph maximum. What problem does this solve for the user?]

## 4. Before you start
- [Pre-condition 1 — e.g. "You must have a project selected in the project bar"]
- [Pre-condition 2 — e.g. "The lead must be in 'Active' status"]
- [Pre-condition 3 — what permissions/role does the user need?]

## 5. Step-by-step process

1. Go to **[Module Name]** in the sidebar
2. Click **[Button Name]**
3. Fill in the **[Field Name]** field — [explain what to enter and why]
4. [Continue numbered steps — one action per step]
5. Click **Save** / **Submit** / **Send**

> 💡 **Tip:** [Optional — include a tip about a non-obvious step or shortcut]

[insert screenshot: description of what screen looks like at this step]

## 6. What happens next
[What does the system do automatically after the user completes this? What records are created? What notifications are sent? Who acts next and how do they know?]

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| [Mistake 1] | [Root cause] | [Prevention] |
| [Mistake 2] | [Root cause] | [Prevention] |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| [Error message or unexpected behaviour] | [Why this happens] | [What to do] |
| Nothing happens when I click [button] | [Common cause] | [Step to resolve] |

## 9. Related modules
- [SOP name → what the connection is](../path/to/sop.md)
- [SOP name → what the connection is](../path/to/sop.md)

## 10. Screenshot placeholders
[insert screenshot: initial state of the screen before starting]
[insert screenshot: the filled form before submitting]
[insert screenshot: the confirmation or result screen]

## 11. Automation notes
[List every automated action the system takes — be specific:]
- Email sent to: [who] with subject: [what]
- Record created in: [table name] with status: [value]
- File saved to: [location]
- Notification triggered: [who sees it, where]
- Status changes: [from → to]

## 12. Edge cases and limits
- [What happens if the required field is blank?]
- [What happens if this action is performed twice?]
- [Are there any maximum limits — file size, character count, number of items?]
- [What happens if a related record is deleted?]

## 13. Owner of the process
[Role responsible for keeping this SOP current — e.g. "Admin / Director"]  
Next review date: [6 months from last_reviewed]

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] [Environment state required — e.g. "Log in as Admin role"]
- [ ] [Test data required — e.g. "A lead in 'Active' status must exist"]
- [ ] [Any other setup — e.g. "Project must be selected in the project bar"]

### Test cases

**TC-01 — Happy path (standard use)**
1. [Exact step to reproduce the normal workflow]
2. [Continue exact steps]
3. Expected result: [What the UI should show]
4. Expected DB record: [What record should exist in which table, with which field values]
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. Navigate to [location]
2. Leave [required field] blank
3. Click Submit / Save
4. Expected result: [Field validation error message — describe exact wording]
5. Expected DB: no new record created
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission**
1. Complete the happy path (TC-01)
2. Immediately repeat the same action with identical data
3. Expected result: [Either creates duplicate, or shows duplicate warning — document which is correct]
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Log out and log in as [a role that should NOT have access]
2. Navigate to [location]
3. Expected result: [Button is hidden / disabled / 403 error]
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification**
1. Complete the happy path (TC-01)
2. Check: [specific automated outcome — e.g. "Confirm email arrived in inbox"]
3. Check: [specific DB record — e.g. "Confirm row exists in `table_name` with status = 'draft'"]
4. Check: [any other automated side effect]
- [ ] Pass  [ ] Fail

**TC-06 — [Feature-specific edge case]**
[Add at least one test case specific to the unusual or risky parts of this particular feature]
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
```

---

## Version numbering

| Change type | Version bump |
|-------------|-------------|
| Minor wording fix | 1.0 → 1.0.1 |
| Step updated | 1.0 → 1.1 |
| Major workflow change | 1.0 → 2.0 |

---

## SOP folder structure

```
/docs/sops/
├── SOP_INDEX.md
├── SOP_MAINTENANCE.md
├── SOP_CHANGELOG.md
├── 00_getting_started/
├── 01_global_navigation/
├── 02_sales/
├── 03_tendering/
├── 04_rfq_engine/
├── 05_operations/
├── 06_scheduling/
├── 07_site_diary/
├── 08_whs/
├── 09_finance/
├── 10_workforce/
├── 11_client_portal/
├── 12_admin_settings/
├── 13_subcontractors/
├── 14_cost_intelligence/
├── 15_financial_command_centre/    ← MODULE 1 (planned)
├── 16_cost_intelligence_engine/    ← MODULE 2 (planned)
├── 17_crm_mailing_list/            ← MODULE 3 (planned)
├── 18_marketing_agent/             ← Marketing Content Studio (existing — needs backfill)
├── 19_marketing_intelligence/      ← MODULE 5 (planned)
└── archive/
```

**Note:** Marketing Content Studio (Create, Library, Campaigns, Media, Music Library) SOPs have not yet been written. Add when running the next SOP audit.

---

*Owner: Company Director / Admin*  
*Next review: 2026-11-20*

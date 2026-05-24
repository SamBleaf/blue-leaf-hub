# SOP Maintenance Guide — Blue Leaf Hub

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

When a new feature is added:

1. Create a new markdown file in the correct module folder (e.g. `09_finance/finance_new_feature.md`)
2. Use the SOP template below
3. Add a row to SOP_INDEX.md with the new SOP ID, name, file path, module, role, status (Draft), screenshot required, and priority
4. Add an entry to SOP_CHANGELOG.md

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
---

# SOP: [Title]

**Module:** [Module Name]  
**SOP ID:** [XX-YY]  
**Status:** Draft  
**Priority:** High / Medium / Low

---

## 1. Who uses this
[List of roles]

## 2. When to use it
[Describe the trigger — when would someone need this SOP?]

## 3. What this does
[Plain English summary of the outcome. No technical language.]

## 4. Before you start
[What must be set up, open, or ready before starting]

## 5. Step-by-step process

1. Go to …
2. Click …
3. Fill in …
4. Click Save / Submit / Send

[insert screenshot: ...]

## 6. What happens next
[What the system does after completion, and who acts next]

## 7. Common mistakes
- [Mistake 1]
- [Mistake 2]

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| [Problem] | [Fix] |

## 9. Related modules
- [SOP name](../path/to/sop.md)

## 10. Screenshot placeholders
[insert screenshot: ...]
[insert screenshot: ...]

## 11. Automation notes
[What does the system do automatically — emails sent, records created, files saved, etc.]

## 12. Owner of the process
[Role responsible for keeping this process current]

## 13. Review date
[Next review date — suggest 6 months from last_reviewed]
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
└── archive/
```

---

*Owner: Company Director / Admin*  
*Next review: 2026-11-20*

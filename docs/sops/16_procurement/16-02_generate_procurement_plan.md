---
sop_version: 1.0
last_reviewed: 2026-06-16
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Generate a Procurement Plan

**Module:** Procurement
**SOP ID:** 16-02
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin, Supervisor

---

## 2. When to use it

When a new job is locked, or any time the estimate, schedule, or template changes and you want the register refreshed.

---

## 3. What this does

Generation builds (or refreshes) the job's procurement register from three sources:

1. **Master template** — the ~62-item backbone, filtered to the job's build type (a renovation won't get slab/trusses; an extension gets termite protection).
2. **Buildxact estimate** — if linked, real line items enrich the template rows with cost allowances.
3. **Schedule** — links each item to the matching schedule task and pulls its required-on-site date, which drives the computed order-by date.

Generation is an **UPSERT**: re-running it adds newly-relevant items and refreshes dates/allowances, but **never overwrites your manual edits and never resurrects an item you deleted.**

---

## 4. Before you start

- Migrations 085 + 091 applied.
- The job exists. Ideally the schedule is built (so on-site dates can be linked) and the Buildxact estimate is linked (so allowances populate) — but neither is required; template-only generation works.

---

## 5. Step-by-step process

**Automatic (preferred):**
1. Open the job in the Financial Command Centre.
2. Press **🔒 Lock job**.
3. The register is auto-drafted in the background (non-fatal — locking still succeeds even if generation hiccups).

**Manual (regenerate any time):**
1. Operations → Procurement → **Register** tab.
2. Choose the job in the dropdown.
3. Press **Regenerate**.
4. Confirm in the prompt ("Your manual edits are preserved…").
5. The register reloads with new/updated items.

> 💡 **Tip:** Regenerate after the Buildxact estimate lands, after a variation, or after a schedule reshuffle.

[insert screenshot: Register tab with Regenerate confirm banner]

---

## 6. What happens next

The register populates. Order-by dates compute for items with an on-site date. Items needing a client selection are flagged. The Command Centre immediately reflects any risks.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Expected an item didn't appear | It's filtered out by build type, or it's not in the template | Add it manually (16-03), or add it to the master template |
| Manual edit lost | (Should not happen) | Edits set `user_modified` and are preserved; report if an edit is lost |
| Duplicate-looking items | Template item + estimate line not matched by fuzzy name | Rename one to match; the next Regenerate will merge them |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| "Generation failed" | DB or role issue | Confirm Admin/Supervisor role and migration 085 |
| Register empty after generate | No active templates and no estimate | Apply migration 091; or link a Buildxact estimate |
| Allowances all blank | No Buildxact estimate linked | Link the estimate, then Regenerate |

---

## 9. Related SOPs

- 16-01: Procurement Overview
- 16-03: Manage the Procurement Register
- 16-04: Triage the Command Centre

---

## 10. Approval and sign-off

Not required for this SOP.

---

## 11. Version history

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-06-16 | Claude | Initial draft (BQ-10 P1 build) |

---

## 12. Screenshots required

- [ ] Lock job button in Financial Command Centre
- [ ] Register Regenerate confirm banner
- [ ] Populated register after generation

---

## 13. Notes for trainers

Generation is idempotent. The "anti-clobber" contract is the whole point: a builder can hand-tune the register and still safely press Regenerate. The template is the floor of "what we must never forget to order"; the estimate refines it.

---

## 14. Troubleshoot Agent Test Script

**Test environment:** Local dev (`npm run dev`). DB must have migrations 085 + 091 applied, plus a seeded job (with a linked project) and ideally a schedule.

### TC-01 — Manual generation populates the register

**Action:** In the Register tab, select a job with an empty register and press Regenerate → confirm.
**Expected:** `POST /api/procurement/jobs/:jobId/generate` returns `{ ok: true, result: { created: >0, total: >0 } }`; the table fills with template items.
**Pass criteria:** Item count > 0; items have source badge "Template".

---

### TC-02 — Build-type filtering

**Action:** Generate for a job whose `project_type` = `renovation`.
**Expected:** Items tagged for `{new_build,knockdown_rebuild,extension}` only (e.g. "Ready-mix concrete", "Wall frames & roof trusses") are **absent**; "Strip-out (internal)" is **present**.
**Pass criteria:** Slab/truss items excluded; strip-out included.

---

### TC-03 — Edit preservation on regenerate

**Action:** Edit one item (e.g. change its lead time), then press Regenerate again.
**Expected:** The edited value is retained; no duplicate row is created.
**Pass criteria:** Edited item unchanged; total count stable.

---

### TC-04 — Deleted item does not resurrect

**Action:** Remove an item (✕), then Regenerate.
**Expected:** The removed item does not reappear.
**Pass criteria:** Removed item still absent after regenerate.

---

### TC-05 — Role gate

**Action:** Call `POST /api/procurement/jobs/:jobId/generate` as an Employee.
**Expected:** HTTP 403.
**Pass criteria:** 403 returned; no generation occurs.

---

### TC-06 — Auto-generate on lock (feature test)

**Action:** Lock a job via `PATCH /api/finance/jobs/:jobId/financials` with `{ financial_locked: true }`.
**Expected:** Lock returns `{ ok: true }`; server log shows "[procurement] auto-generated on lock"; the register now has items.
**Pass criteria:** Register populated; the lock succeeds even if generation logs a warning.

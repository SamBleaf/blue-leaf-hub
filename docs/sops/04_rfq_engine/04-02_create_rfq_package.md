---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 04-02: Create an RFQ Package

**Module:** Tender Manager → RFQ Engine  
**SOP ID:** 04-02  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin (tender coordinators)

## 2. When to use it
When a project is progressing toward tender and you need to request prices from subcontractors. Create one RFQ package per project tender.

## 3. What this does
Creates the top-level RFQ record linked to a job. The package holds the project details (address, type, deadline, architect/client name) and will contain all the trade scopes for this tender.

## 4. Before you start
- The project and job must exist in the system
- Know: project address, tender deadline date, architect or client name

## 5. Step-by-step process

1. Navigate to **Tender Manager → RFQ Engine**
2. Click **+ New package**
3. Fill in:
   - **Job** (required) — select the linked job from the dropdown
   - **Project address** (required) — e.g. "21 Folkstone Rd, Brighton SA 5048"
   - **Project type** — new build / renovation / extension
   - **Tender deadline** — the date by which all quotes must be submitted
   - **Architect / client** — the architect's name or client name (used in email headers)
4. Upload tender documents (optional at this stage — can be added later)
5. Click **Create**

The package is created. You're now taken to the package detail where you'll add trade scopes (SOP 04-03 and SOP 04-04).

## 6. What happens after creating

- `rfq_packages` row created with `status = 'active'`
- Trade intelligence is pre-computed from the Buildexact estimate (if job is linked to Buildexact) — `estimate_baseline`, `missing_trade_analysis`, `trade_coverage` fields populated
- No emails are sent at this stage

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Not linking to a job | Forgot | Every RFQ package must link to a job — required field. Without a job link, costs can't flow into the Job Command Centre. |
| Setting tender deadline in the past | Copied wrong date | Check that the deadline is a future date before creating |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "job_id required" error | Select a job from the dropdown — this is mandatory |
| "project_address required" error | Enter at least a street address |
| Job doesn't appear in the dropdown | The job may not have been created yet — check the Operations/Finance module |

## 9. Automation notes
- API: `POST /api/rfq-packages` with `{ job_id, project_address, project_type, tender_deadline, architect_client, trade_scopes }`
- `job_id` required — returns 400 if absent
- On create: calls `buildRfqTradeIntelligence()` to pre-populate trade coverage from Buildexact estimate if available
- `status` defaults to `'active'`

## 10. Owner of the process
Admin  
Next review: 2026-11-29

---

## 11. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least 1 job exists in the system
- [ ] Logged in as Admin

### Test cases

**TC-01 — Create package (happy path)**
1. Navigate to Tender Manager → RFQ Engine → + New package
2. Fill: project_address = "1 Test St, Adelaide SA 5000", job = (select any job), tender_deadline = next month
3. Click Create
4. Expected: package appears in the list
5. Expected DB: `rfq_packages` row with `status = 'active'`, `job_id` set, `project_address` = "1 Test St, Adelaide SA 5000"
- [ ] Pass  [ ] Fail

**TC-02 — Job required**
1. Attempt to create without selecting a job
2. Expected: "job_id required" error
3. Expected: no `rfq_packages` row created
- [ ] Pass  [ ] Fail

**TC-03 — Project address required**
1. Attempt to create without entering project address
2. Expected: validation error — no row created
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Package creates with required fields
- [ ] Job link is enforced
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

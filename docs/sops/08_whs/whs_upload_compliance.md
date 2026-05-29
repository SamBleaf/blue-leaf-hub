---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: placeholders_only
owner: Admin
test_status: static_pass
---

# SOP 08-01: Upload a Subcontractor Compliance Document

**Module:** Operations → WHS Manager → Compliance  
**SOP ID:** 08-01  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Supervisor

## 2. When to use it
When a subcontractor provides a compliance document — public liability insurance, workers comp, a licence, or similar — that needs to be on file before they work on site.

## 3. What this does
Stores a subcontractor's compliance document, records its type and expiry date, files the PDF in Dropbox, and automatically computes whether the document is current, expiring soon, expired, or missing based on the expiry date.

## 4. Before you start
- The subcontractor exists in the register
- You have the document file (PDF or image) and its expiry date
- You know the document type (e.g. Public Liability, Workers Comp, Licence)

## 5. Step-by-step process

1. Open the project in Operations, then open **WHS → Compliance**
2. Find the subcontractor (those with a PO on this project are listed)
3. Click **Upload document** for that subcontractor
4. Fill in:
   - **Document type** (required) — e.g. "Public Liability"
   - **Document name** (optional)
   - **Issue date** and **Expiry date** — expiry drives the status
   - **Policy number / Insurer** (optional, for insurance docs)
   - **File** (required) — the PDF or image
5. Click **Upload**

The document is saved and its status is computed from the expiry date.

## 6. What happens next

- The file is uploaded to Dropbox under `CONTRACTORS/[business]/[type]-[date]`
- A `contractor_compliance` row is inserted with the computed status
- Status is computed: **missing** (no expiry), **expired** (past), **expiring_soon** (within 30 days), **current** (more than 30 days out)

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| No expiry date | Seemed optional | Without an expiry, the status is "missing" — always enter it for insurances/licences |
| Wrong document type | Free text | Use consistent type names so the compliance view groups correctly |
| Uploading to the wrong subcontractor | Similar names | Confirm the business name before uploading |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "subcontractorId, documentType, fileBase64 required" (400) | A required field is missing — type and file are both mandatory |
| "Subcontractor not found" (404) | The subcontractor ID doesn't exist — add them to the register first |
| Document uploaded but status "missing" | No expiry date was entered — edit and add one |
| Dropbox copy not saved | Dropbox may be unavailable — the record still saves; the file copy is best-effort |

## 9. Related modules
- [Check compliance status for a project](whs_check_compliance_status.md) — SOP 08-02
- [Add a subcontractor](../13_subcontractors/subcontractors_add.md) — SOP 13-01

## 10. Screenshot placeholders
[insert screenshot: compliance upload form]
[insert screenshot: document with computed status badge]

## 11. Automation notes
- API: `POST /api/whs/compliance` (requires auth) with `{ subcontractorId, documentType, fileBase64, fileName?, documentName?, issueDate?, expiryDate?, policyNumber?, insurer? }`
- Required: `subcontractorId`, `documentType`, `fileBase64` (400 otherwise); subcontractor must exist (404 otherwise)
- File uploaded to Dropbox `…/CONTRACTORS/[business-segment]/[type]-[YYYY-MM-DD].[ext]`
- Inserts `contractor_compliance` with `status` from `complianceStatusFromExpiry(expiryDate)`
- Status rule: no expiry → `missing`; expiry < today → `expired`; ≤ 30 days → `expiring_soon`; else → `current`

## 12. Edge cases and limits
- Allowed file extensions: pdf, png, jpg/jpeg, webp (defaults to `.pdf`)
- Re-uploading creates a new compliance row (history is kept; the latest determines the view)
- Dropbox upload uses `autorename` to avoid clobbering an existing file

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in
- [ ] A subcontractor in the register with a PO on the test project
- [ ] A sample PDF to upload

### Test cases

**TC-01 — Upload compliance doc (happy path)**
1. Upload a document with type "Public Liability" and an expiry 6 months out
2. Expected: `{ ok: true, document: { ..., computed_status: "current" } }`
3. Expected DB: `contractor_compliance` row with `status = 'current'`, dropbox_path set
- [ ] Pass  [ ] Fail

**TC-02 — Missing required field**
1. Attempt upload with no document type
2. Expected: HTTP 400 "subcontractorId, documentType, fileBase64 required."
- [ ] Pass  [ ] Fail

**TC-03 — Unknown subcontractor**
1. Upload against a non-existent subcontractorId
2. Expected: HTTP 404 "Subcontractor not found."
- [ ] Pass  [ ] Fail

**TC-04 — Expired status computed**
1. Upload a document with an expiry date in the past
2. Expected: `computed_status = "expired"`, DB `status = 'expired'`
- [ ] Pass  [ ] Fail

**TC-05 — Expiring soon (within 30 days)**
1. Upload a document with an expiry 10 days from now
2. Expected: `computed_status = "expiring_soon"`
- [ ] Pass  [ ] Fail

**TC-06 — No expiry → missing**
1. Upload a document with no expiry date
2. Expected: `computed_status = "missing"`
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Document uploads and persists
- [ ] Required-field validation works
- [ ] Status computed correctly for current/expiring/expired/missing
- [ ] Dropbox copy filed
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: placeholders_only
owner: Admin
test_status: static_pass
---

# SOP 08-02: Check Compliance Status for a Project

**Module:** Operations → WHS Manager → Compliance  
**SOP ID:** 08-02  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Supervisor

## 2. When to use it
Before work starts on site and at regular intervals, to confirm every subcontractor engaged on the project has current compliance documents (insurances, licences).

## 3. What this does
Lists every subcontractor with a purchase order on the project and shows their compliance documents, each with an automatically computed status (current / expiring soon / expired / missing) so you can see at a glance who is safe to have on site.

## 4. Before you start
- The project exists and has purchase orders issued to subcontractors
- Compliance documents have been uploaded (SOP 08-01)

## 5. Step-by-step process

1. Open the project in Operations, then open **WHS → Compliance**
2. The list shows each subcontractor (those with a PO on this project)
3. For each, review their documents and status badges:
   - 🟢 **Current** — valid, more than 30 days to expiry
   - 🟡 **Expiring soon** — expires within 30 days
   - 🔴 **Expired** — past expiry, must be renewed before site work
   - ⚪ **Missing** — no document or no expiry recorded
4. Chase any expiring/expired/missing documents with the subcontractor
5. Upload renewed documents (SOP 08-01)

## 6. What happens next

- The status is recomputed live from each document's expiry date every time the list loads
- No data is changed by viewing — this is a read-only check

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Trusting an old "current" badge | Status is live, but the doc may be the wrong one | Open the document to confirm it's the right insurance/licence |
| Only checking once | Documents expire | Check before each new trade starts, not just at project start |
| Missing a subcontractor | They have no PO yet | Only subcontractors with a PO on the project appear — issue the PO first |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Subcontractor not listed | They have no PO on this project, or no `subcontractor_id` on the PO |
| All documents show "missing" | No expiry dates were recorded on upload — re-upload with expiry dates |
| "Supabase service role not configured" (503) | Server env vars missing |

## 9. Related modules
- [Upload a subcontractor compliance document](whs_upload_compliance.md) — SOP 08-01

## 10. Screenshot placeholders
[insert screenshot: compliance list with status badges]

## 11. Automation notes
- API: `GET /api/whs/:projectId/compliance` (requires auth) → `{ ok: true, subcontractors: [...] }`
- Subcontractors derived from `purchase_orders` on the project where `subcontractor_id` is not null
- Each document carries a live `computed_status` from `complianceStatusFromExpiry(expiry_date)`
- Status rule: no expiry → `missing`; past → `expired`; ≤ 30 days → `expiring_soon`; else → `current`

## 12. Edge cases and limits
- A subcontractor on the project but with no compliance docs shows an empty documents list
- Documents are grouped per subcontractor; multiple documents per subcontractor are all listed
- The compliance view scopes to one project (via its POs) — a subcontractor's docs are global to the subcontractor record

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in
- [ ] A project with at least 2 subcontractors that have POs
- [ ] One subcontractor with a current document, one with an expired document

### Test cases

**TC-01 — Compliance list loads (happy path)**
1. Open WHS → Compliance for the project
2. Expected: each PO subcontractor listed with their documents
3. Expected: `GET /api/whs/:projectId/compliance` returns `{ ok: true, subcontractors: [...] }`
- [ ] Pass  [ ] Fail

**TC-02 — Current status badge**
1. View a subcontractor with a document expiring in 6 months
2. Expected: status `current` (🟢)
- [ ] Pass  [ ] Fail

**TC-03 — Expired status badge**
1. View a subcontractor with a document past its expiry
2. Expected: status `expired` (🔴)
- [ ] Pass  [ ] Fail

**TC-04 — Subcontractor with no docs**
1. View a PO subcontractor that has no compliance documents
2. Expected: listed with an empty documents array
- [ ] Pass  [ ] Fail

**TC-05 — Only PO subcontractors appear**
1. Confirm a subcontractor with no PO on this project is NOT listed
2. Expected: absent from the compliance list
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] List loads PO subcontractors
- [ ] Status badges accurate (current/expiring/expired/missing)
- [ ] No-doc subcontractors handled
- [ ] Scope limited to PO subcontractors
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

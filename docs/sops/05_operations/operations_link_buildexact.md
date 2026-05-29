---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: placeholders_only
owner: Admin
test_status: static_pass
---

# SOP 05-04: Link a Project to Buildexact

**Module:** Operations Manager / Settings → Buildexact  
**SOP ID:** 05-04  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Admin

## 2. When to use it
When a project should pull its estimate, categories, and purchase-order sync from Buildexact (Buildxact). Linking lets budgets seed automatically and POs sync back to Buildexact.

## 3. What this does
Associates a Blue Leaf project with its matching Buildexact job. Once linked, the Hub can look up the Buildexact job, pull its estimate, and push purchase orders to it.

> **Status note:** Buildexact integration requires `BUILDEXACT_SUBSCRIPTION_KEY` (Azure APIM key) plus `BUILDEXACT_API_KEY` and `BUILDEXACT_USERNAME` to be configured. If these are not set, lookups return a 503 "Buildxact not configured" and linking features are inactive.

## 4. Before you start
- Buildexact credentials configured in Railway (subscription key + API key + username)
- The project exists in the Hub
- You know the Buildexact job ID (or the project was created from a Buildexact source)

## 5. How a project gets linked

Linking happens in one of three ways:

1. **At job creation** — when a job/project is created from a Buildexact source, `buildexact_job_id` is set with `buildexact_link_source = 'pending'`
2. **Via webhook** — when Buildexact fires an Estimate Accepted or Lead webhook, the Hub links the project with `buildexact_link_source = 'webhook'`
3. **Verifying the link** — use the Buildexact job lookup to confirm the link resolves to the correct Buildexact job

## 6. Step-by-step process (verify a link)

1. Open the project in Operations
2. The project shows its `buildexact_job_id` and `buildexact_link_source` (pending / webhook)
3. To verify the link resolves, the Hub calls the Buildexact job lookup by ID
4. If it returns the expected job, the link is good
5. Pull the estimate to seed budgets and category data

## 7. What happens next

- The operations project list surfaces `buildexact_job_id` and `buildexact_link_source`
- The Buildexact job lookup (`GET /api/buildexact/job/:id`) logs in and fetches the job
- The estimate pull (`GET /api/buildexact/job/:buildexactJobId/estimate`) returns categories + line items
- Issued POs sync to Buildexact when `buildexactJobId` is present (SOP 05-03)

## 8. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Expecting auto-link without credentials | Keys not set | Confirm `BUILDEXACT_SUBSCRIPTION_KEY` etc. are in Railway first |
| Wrong Buildexact job ID | Manual entry error | Verify the lookup returns the correct job before relying on it |
| Assuming budgets seed without an estimate | No estimate pulled | Budgets seed from the estimate — pull it after linking |

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Buildxact not configured" (503) | Subscription key / API key / username missing — add them in Railway |
| "id required" (400) | The lookup was called without a Buildexact job ID |
| Lookup returns 502 | Buildexact API error — check the subscription approval and key validity |
| POs not syncing | The project's `buildexact_job_id` is empty — confirm the link |

## 10. Screenshot placeholders
[insert screenshot: project showing Buildexact link source]
[insert screenshot: Buildexact connection test in Settings]

## 11. Automation notes
- Job lookup: `GET /api/buildexact/job/:id` (requires auth) — returns 503 if Buildexact not configured, 400 if no id, else `{ ok, job }`
- Estimate pull: `GET /api/buildexact/job/:buildexactJobId/estimate`
- Link source values on `projects`: `buildexact_link_source` ∈ {`pending` (set at creation), `webhook` (set by Buildexact webhook)}
- Webhooks configured in Buildexact app → My Business → API → Add Webhook (Estimate Accepted, Lead Created/Updated)
- PO sync uses `buildexactJobId` passed to `POST /api/po/issue`

## 12. Edge cases and limits
- Linking is largely automatic (creation or webhook) — there is no manual "link this ID" form documented in the current build
- Without credentials, all Buildexact endpoints return 503 and the link is inert
- `buildexact_link_source = 'pending'` means a link is expected but not yet confirmed via webhook

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] (For positive tests) Buildexact credentials configured and a known Buildexact job ID
- [ ] (For negative test) a state where Buildexact is not configured

### Test cases

**TC-01 — Job lookup (happy path)**
1. Call `GET /api/buildexact/job/:id` with a valid Buildexact job ID
2. Expected: `{ ok: true, job: {...} }` with the expected job
3. (SKIP if Buildexact not configured — run TC-04 instead)
- [ ] Pass  [ ] Fail

**TC-02 — Missing id rejected**
1. Call the lookup with an empty id
2. Expected: HTTP 400 `{ ok: false, error: "id required." }`
- [ ] Pass  [ ] Fail

**TC-03 — Link source surfaced on project list**
1. Open the Operations project list
2. Expected: linked projects expose `buildexact_job_id` and `buildexact_link_source` in the API payload
- [ ] Pass  [ ] Fail

**TC-04 — Not configured returns 503**
1. With Buildexact credentials absent, call the job lookup
2. Expected: HTTP 503 `{ ok: false, error: "Buildxact not configured." }`
- [ ] Pass  [ ] Fail

**TC-05 — Estimate pull**
1. With a linked job, call `GET /api/buildexact/job/:buildexactJobId/estimate`
2. Expected: categories + line items returned
3. (SKIP if not configured)
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Lookup works with valid id (or correctly 503s when unconfigured)
- [ ] Missing id rejected
- [ ] Link source visible on project list
- [ ] Estimate pull returns categories
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP 12-04: Connect Buildexact Integration

**Module:** Admin Settings — Integrations  
**SOP ID:** 12-04  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin only. This is a one-time setup task — done once when the app is first configured, and again if the Buildexact credentials change.

## 2. When to use it
- When setting up Blue Leaf Hub for the first time
- When your Buildexact API credentials change or expire
- When troubleshooting Buildexact sync issues

## 3. What this does
Connects Blue Leaf Hub to your Buildexact account so that jobs, contract values, and estimates can be imported automatically. Once connected, you can link individual projects to Buildexact jobs (SOP 05-04) and sync cost data.

## 4. Before you start
- You have your Buildexact credentials:
  - `BUILDEXACT_USERNAME` — your Buildexact account username
  - `BUILDEXACT_API_KEY` — found in your Buildexact account under API settings
  - `BUILDEXACT_SUBSCRIPTION_KEY` — provided by Buildexact support
- You have access to the Railway deployment dashboard (where the app is hosted)
- You are logged in as Admin

## 5. Step-by-step process

### Step 1 — Add credentials to Railway
1. Log in to your Railway project dashboard (railway.app)
2. Go to your service -> **Variables**
3. Add or update these three environment variables:
   - `BUILDEXACT_USERNAME` = your username
   - `BUILDEXACT_API_KEY` = your API key
   - `BUILDEXACT_SUBSCRIPTION_KEY` = your subscription key
4. Railway will redeploy the service automatically with the new variables

### Step 2 — Test the connection
1. In Blue Leaf Hub, go to **Settings** -> **Integrations** -> **Buildexact**
2. Click **Test Connection**
3. Expected: "Connected successfully" message with your Buildexact account name shown
4. If the test fails, double-check the credentials in Railway

## 6. What happens after
- Buildexact sync is available across the app
- You can link projects to Buildexact jobs (SOP 05-04)
- The RFQ Engine can pull estimate data from Buildexact jobs

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Setting env vars in the wrong Railway service | Multiple services in the project | Set vars on the API service (not the frontend or database service) |
| Copying credentials with trailing spaces | Copy-paste from email or PDF | Paste into a plain text editor first to strip formatting, then copy into Railway |
| Not redeploying after adding vars | Railway redeploys automatically, but if it does not | Click "Redeploy" manually in Railway after adding the variables |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Buildexact connection failed" | Double-check all three credentials are correct and entered without typos |
| API returns 401 Unauthorized | API key may have expired — regenerate in Buildexact and update in Railway |
| Buildexact jobs not appearing after linking | Check the Buildexact job exists and is active in your Buildexact account |

## 9. Related SOPs
- [Link a project to Buildexact](../05_operations/operations_link_buildexact.md) — SOP 05-04

## 10. Automation notes
- Credentials stored as Railway environment variables: `BUILDEXACT_USERNAME`, `BUILDEXACT_API_KEY`, `BUILDEXACT_SUBSCRIPTION_KEY`
- Also referenced in codebase as `BUILDEXACT_API_URL` (base URL of the Buildexact API)
- Used by: `registerModule4Routes` (RFQ engine Buildexact sync), `registerJobsApiRoutes` (job lookup)
- Test connection: calls Buildexact API with stored credentials to verify authentication
- No DB effects from the credential setup itself — credentials are env vars, not stored in the database

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] Valid Buildexact credentials available
- [ ] Access to Railway dashboard

### Test cases

**TC-01 — Credentials set in Railway and service redeploys**
1. Add `BUILDEXACT_USERNAME`, `BUILDEXACT_API_KEY`, `BUILDEXACT_SUBSCRIPTION_KEY` to Railway variables
2. Expected: Railway redeploys the service
3. Expected: service is healthy after redeployment (Railway shows green status)
- [ ] Pass  [ ] Fail

**TC-02 — Test connection succeeds**
1. In Blue Leaf Hub -> Settings -> Integrations -> Buildexact -> Test Connection
2. Expected: "Connected successfully" message
3. Expected: no 401 or 500 error
- [ ] Pass  [ ] Fail

**TC-03 — Invalid credentials produce clear error**
1. Temporarily change one credential to an incorrect value in Railway -> redeploy
2. Run Test Connection
3. Expected: "Connection failed" message with a plain English reason (not a raw API error)
4. Restore correct credentials
- [ ] Pass  [ ] Fail

**TC-04 — Buildexact job lookup works after connection**
1. Use the link-project flow (SOP 05-04) to look up a Buildexact job by ID
2. Expected: job details returned from Buildexact API
- [ ] Pass  [ ] Fail

**TC-05 — Missing credential causes informative error on first deploy**
1. Remove one credential from Railway -> redeploy
2. Expected: app still starts but Buildexact-dependent features return a clear "Buildexact not configured" message, not a crash
- [ ] Pass  [ ] Fail

**TC-06 — Credentials not exposed in browser**
1. Open browser dev tools -> Network tab -> call any Buildexact-related API route
2. Expected: credentials do NOT appear in any response body or headers
3. Expected: only the result of the API call (job data or error) is returned
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Credentials set in Railway and service healthy
- [ ] Test connection returns success
- [ ] Invalid credentials produce plain English error
- [ ] Buildexact job lookup functional
- [ ] Credentials not exposed to browser
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
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
Connects Blue Leaf Hub to your Buildexact (Buildxact) account so that jobs, contract values, and estimates can be imported automatically. Server credentials are set via Railway environment variables. The Settings page also lets you test the connection using your Buildexact login email and API key, and view recent webhook events from Buildexact.

## 4. Before you start
- You have your Buildexact credentials:
  - `BUILDEXACT_API_URL` — the Buildexact API base URL
  - Your Buildexact **login email** (username)
  - Your Buildexact **API key** (used as both the login body key and the `Ocp-Apim-Subscription-Key` header)
- You have access to the Railway deployment dashboard (where the API server is hosted)
- You are logged in as Admin

## 5. Step-by-step process

### Step 1 — Add credentials to Railway
1. Log in to your Railway project dashboard (railway.app)
2. Go to your API service → **Variables**
3. Add or update these environment variables:
   - `BUILDEXACT_API_URL` = the Buildexact API base URL (e.g. `https://api.buildxact.com`)
   - `BUILDEXACT_USERNAME` = your Buildexact login email (used as a fallback if not entered in the UI)
   - `BUILDEXACT_API_KEY` = your Buildexact API key
   - `BUILDEXACT_SUBSCRIPTION_KEY` = your subscription key (if separate from API key)
4. Railway will redeploy the service automatically

### Step 2 — Test the connection in the app
1. In Blue Leaf Hub, go to **Settings** → scroll to the **Buildexact** section
2. Enter your **Username (email)** and **API key** in the fields provided
3. Click **Save locally** to store these credentials in your browser for future test runs
4. Click **Test connection (login)**
5. Expected: the message "Login succeeded — token cached on the API." appears
6. The Token status panel updates to show the credential source, token validity, and expiry
7. If you leave the email and API key fields empty and click Test, the server will use the `.env` credentials instead

### Step 3 — Register the webhook (after deploy)
1. In the Settings → Buildexact section, copy the **Webhook URL** shown in the Token status panel
2. Log in to your Buildexact account → Settings → Webhooks
3. Register the copied URL as the webhook endpoint for job update events
4. Webhook events will then appear in the "Recent webhook events" table in Settings

## 6. What happens next
- Buildexact sync is available across the app
- You can link projects to Buildexact jobs (SOP 05-04)
- The RFQ Engine can pull estimate data from Buildexact jobs
- Webhook events from Buildexact appear in the Settings panel (last 10 events shown)

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Setting env vars in the wrong Railway service | Multiple services in the project | Set vars on the API service (not the frontend or database service) |
| Copying credentials with trailing spaces | Copy-paste from email or PDF | Paste into a plain text editor first to strip formatting, then copy into Railway |
| Not redeploying after adding vars | Railway redeploys automatically, but occasionally needs a manual push | Click "Redeploy" manually in Railway if the service does not redeploy after adding variables |
| Entering browser credentials but not clicking Test | Fields are local only until Test is clicked | Always click Test connection (login) after entering credentials to confirm they work |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Failed (401)" after clicking Test | API key or email is incorrect | Double-check both fields; re-copy from Buildexact account settings |
| Token status shows "Token valid: No" | Token near expiry or not cached | Click Test connection (login) again to refresh the token |
| Buildexact jobs not appearing after linking | Buildexact job does not exist or is inactive | Check the Buildexact job exists and is active in your Buildexact account |
| No webhook events appearing | Webhook URL not registered in Buildexact | Copy the webhook URL from the Token status panel and register it in Buildexact → Settings → Webhooks |
| API server not loading Buildexact status | `.env` missing credentials and server not redeployed | Confirm Railway env vars are set and the service shows healthy (green) status |

## 9. Related modules
- [Link a project to Buildexact](../05_operations/operations_link_buildexact.md) — SOP 05-04

## 10. Screenshot placeholders
[insert screenshot: Settings page scrolled to the Buildexact section showing the email and API key fields]
[insert screenshot: Token status panel showing "Configured: Yes", token validity, and expiry time]
[insert screenshot: Webhook URL panel with the Copy URL button]
[insert screenshot: Recent webhook events table with sample events]

## 11. Automation notes
- API endpoint: `POST /api/buildexact/test-connection` — body `{ email, apiKey }` (or empty to use `.env` creds) — authenticates with Buildexact, caches the token on the API process
- API endpoint: `GET /api/buildexact/status` — returns `{ configured, token: { credentialSource, hasCachedToken, tokenValid, expiresAt }, webhookUrl }`
- API endpoint: `GET /api/buildexact/webhook-events` — returns last 10 webhook events from Supabase
- Browser credentials stored in localStorage under key `blhub_buildexact_ui_v1` (`{ email, apiKey }`) — not sent to the server until Test is clicked
- Server `.env` credentials: `BUILDEXACT_API_URL`, `BUILDEXACT_USERNAME`, `BUILDEXACT_API_KEY`, `BUILDEXACT_SUBSCRIPTION_KEY`
- Used by: `registerModule4Routes` (RFQ engine Buildexact sync), `registerJobsApiRoutes` (job lookup)
- No DB effects from credential setup — credentials are env vars or process-memory token cache

## 12. Edge cases and limits
- If email and API key fields are left blank and Test is clicked, the server uses its `.env` credentials; this clears any previous browser-session override
- Credentials entered in the browser fields are stored in localStorage only — they are not encrypted
- The token cache lives in API process memory — a Railway redeploy clears the cache (re-click Test to re-authenticate)
- If `BUILDEXACT_API_URL` is not set in `.env`, Buildexact-dependent features return "Buildexact not configured" rather than crashing
- Webhook URL is auto-generated from the deployed hostname — it changes if the Railway service hostname changes

## 13. Owner of the process
Admin  
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Log in as Admin
- [ ] Valid Buildexact credentials available (login email + API key)
- [ ] Access to Railway dashboard
- [ ] API server running and accessible

### Test cases

**TC-01 — Status endpoint returns configuration state**
1. Call `GET /api/buildexact/status` (or observe the Token status panel in Settings → Buildexact)
2. If credentials set in `.env`: expected `configured: true`
3. Expected: response includes `token.credentialSource`, `token.hasCachedToken`, `token.tokenValid`, `webhookUrl`
- [ ] Pass  [ ] Fail

**TC-02 — Test connection succeeds with valid credentials**
1. Settings → Buildexact → enter valid email and API key → click Test connection (login)
2. Expected: message "Login succeeded — token cached on the API." appears
3. Expected: Token status panel updates to show `tokenValid: true` and an expiry time
- [ ] Pass  [ ] Fail

**TC-03 — Invalid credentials produce clear error**
1. Enter an incorrect API key → click Test connection (login)
2. Expected: error message appears (e.g. "Failed (401)") — not a raw API error
3. Expected: Token status panel shows `tokenValid: false`
- [ ] Pass  [ ] Fail

**TC-04 — Credentials save locally**
1. Enter valid email and API key → click Save locally
2. Reload the page → navigate back to Settings → Buildexact
3. Expected: email and API key fields are pre-filled with the saved values
4. Expected localStorage: `blhub_buildexact_ui_v1` contains `{ email, apiKey }` values
- [ ] Pass  [ ] Fail

**TC-05 — Empty fields fall back to .env credentials**
1. Clear the email and API key fields → click Test connection (login)
2. Expected: the server uses its `.env` credentials
3. Expected message: "Login succeeded — token cached on the API." (if `.env` is configured) or a clear "Buildexact not configured" message (if `.env` is not set)
- [ ] Pass  [ ] Fail

**TC-06 — Credentials not exposed in browser**
1. Open browser DevTools → Network tab
2. Click Test connection (login)
3. Observe the request payload and response for `POST /api/buildexact/test-connection`
4. Expected: credentials appear in the request body (as sent by the user) but do NOT appear in any response body
5. Expected: the Buildexact API access token is NOT returned to the browser — only a success/failure message
- [ ] Pass  [ ] Fail

**TC-07 — Webhook events table loads**
1. With Buildexact webhook registered and at least one event received, view Settings → Buildexact → Recent webhook events
2. Expected: table shows up to 10 events with columns: Type, Received, Matched, Processed
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] Status endpoint returns expected fields
- [ ] Test connection with valid credentials succeeds
- [ ] Invalid credentials produce a plain English error
- [ ] Browser credentials save and reload correctly
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

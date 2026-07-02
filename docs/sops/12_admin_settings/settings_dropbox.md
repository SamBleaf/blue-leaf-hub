---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP 12-06: Connect Dropbox Integration

**Module:** Admin Settings — Integrations  
**SOP ID:** 12-06  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin only. This is a one-time setup task done when the app is first deployed — and again if the Dropbox token expires or is revoked.

## 2. When to use it
- When setting up Blue Leaf Hub for the first time
- When the Dropbox refresh token expires or is revoked (tokens can expire after 90 days of inactivity or if permissions are changed)
- When troubleshooting Dropbox file upload failures

## 3. What this does
Connects Blue Leaf Hub to your Dropbox Business account. Once connected, the app can:
- Create project folders automatically when a new job is set up
- Upload compliance documents, fee proposals, and RFQ files to the correct folder
- Read files from Dropbox folders for processing

## 4. Before you start
- You have admin access to the Dropbox Business account (use the company account, not a personal one)
- You have access to the Railway deployment dashboard
- Node.js is installed on your local computer (to run the auth script)
- You have the Dropbox app credentials: `DROPBOX_APP_KEY` and `DROPBOX_APP_SECRET` (from the Dropbox Developer console)

## 5. Step-by-step process

### Step 1 — Run the OAuth flow locally
1. On your local computer, open a terminal in the Blue Leaf Hub project folder
2. Make sure `.env` has `DROPBOX_APP_KEY` and `DROPBOX_APP_SECRET` set
3. Run:
   ```
   npm run auth:dropbox
   ```
4. The script opens a browser window — log in to Dropbox with the company Dropbox account
5. Click **Allow** to authorise the app
6. The script prints a `DROPBOX_REFRESH_TOKEN` — copy this value immediately

### Step 2 — Add credentials to Railway
1. Log in to Railway → your API service → **Variables**
2. Add or update:
   - `DROPBOX_APP_KEY` = your app key
   - `DROPBOX_APP_SECRET` = your app secret
   - `DROPBOX_REFRESH_TOKEN` = the token from Step 1
   - `DROPBOX_NAMESPACE_ID` = your Dropbox Business team namespace ID (from Dropbox admin panel → Team folder settings)
   - `DROPBOX_INTERNAL_VIEWER_EMAILS` (optional) = comma-separated Dropbox login emails for private INTERNAL folder access
3. Railway redeploys the service automatically

### Step 3 — Verify the connection
1. In Blue Leaf Hub, go to **Settings** in the sidebar
2. Scroll to the **Dropbox** section
3. The Dropbox status panel shows: "Configured: Yes" if all required env vars are present

## 6. What happens next
- Dropbox file operations are available across the app
- New jobs automatically get a Dropbox folder created under the shared path
- Compliance documents, fee proposals, and subcontractor quotes are filed to Dropbox in the correct sub-folder
- Private INTERNAL folders are shared only with the emails listed in `DROPBOX_INTERNAL_VIEWER_EMAILS`

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Running auth:dropbox while logged into a personal Dropbox | Browser has personal account active | Log out of personal Dropbox before running the auth script, then log in with the company account |
| Losing the refresh token before adding to Railway | Terminal closed before copying | The script prints the token clearly — copy it immediately before closing the terminal |
| Wrong namespace ID | Dropbox Business has team and personal namespaces | Get the namespace ID from Dropbox Business admin panel → Members → Team folder settings |
| Forgetting DROPBOX_INTERNAL_VIEWER_EMAILS | Optional field overlooked | Without this, the INTERNAL private folder will be visible to all Dropbox team members |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Dropbox upload failed" on file uploads | Token may be expired or revoked | Re-run `npm run auth:dropbox` and update `DROPBOX_REFRESH_TOKEN` in Railway |
| Files upload but appear in the wrong folder | `DROPBOX_NAMESPACE_ID` incorrect | Check the namespace ID from the Dropbox Business admin panel and update in Railway |
| "Invalid refresh token" in server logs | Token was revoked in Dropbox (e.g. app permissions changed) | Re-run the auth flow (`npm run auth:dropbox`) to generate a new token |
| Dropbox status shows "Configured: No" | One or more env vars missing in Railway | Confirm all four required env vars are set: `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN`, `DROPBOX_NAMESPACE_ID` |
| Concurrent read errors on Dropbox Smart Sync files | App attempted parallel reads | Expected behaviour — the app uses sequential for-loops (not `Promise.all`) for Dropbox file reads; if this error appears, check for any new code that uses concurrent reads |

## 9. Related modules
- [Connect Buildexact integration](settings_buildexact.md) — SOP 12-04
- RFQ Engine (SOP 04-series) — Dropbox is used to store subcontractor quote files and RFQ send folders

## 10. Screenshot placeholders
[insert screenshot: Settings page scrolled to the Dropbox section showing "Configured: Yes" status]
[insert screenshot: Terminal output after running `npm run auth:dropbox` showing the DROPBOX_REFRESH_TOKEN]
[insert screenshot: Railway Variables panel with the four Dropbox env vars set]

## 11. Automation notes
- Run `npm run auth:dropbox` locally to generate `DROPBOX_REFRESH_TOKEN` — this script is at `scripts/dropbox-auth.mjs`
- Required env vars: `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN`, `DROPBOX_NAMESPACE_ID`
- Optional env var: `DROPBOX_INTERNAL_VIEWER_EMAILS` (comma-separated) — shares private INTERNAL folder with specified Dropbox accounts
- Status check: `GET /api/integrations/status` returns `dropbox: { configured: true/false }`
- Used by: `server/lib/dropboxClient.mjs` — handles token auto-refresh and namespace routing for all Dropbox API calls
- Folder path structure:
  - Shared tender docs: `/BLUE LEAF BUILDING/PROJECTS/BLUE LEAF BUILDING/[job address]/`
  - Private RFQ/quote/presale: `/BLUE LEAF BUILDING/INTERNAL/[job address]/`
- Critical: all Dropbox file reads must use sequential for-loops — NOT `Promise.all` — because Smart Sync (online-only) files fail under concurrent reads

## 12. Edge cases and limits
- Dropbox refresh tokens do not expire on a fixed schedule but are invalidated if the app's permissions are changed in Dropbox settings — always re-run auth:dropbox after any permission change
- The OAuth account used for auth:dropbox always retains folder access, regardless of `DROPBOX_INTERNAL_VIEWER_EMAILS`
- If `DROPBOX_NAMESPACE_ID` is not set, files will be created in the OAuth user's personal namespace, not the Business team folder
- Smart Sync (online-only) files require sequential reads — any new code reading Dropbox folders must use a for-loop, not `Promise.all`
- Uploading files exceeding Dropbox's single-file upload limit (150 MB) requires chunked upload — check `dropboxClient.mjs` for the upload method used

## 13. Owner of the process
Admin  
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Valid Dropbox credentials available (`DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`)
- [ ] Access to Railway dashboard
- [ ] Node.js installed locally
- [ ] A test project/job exists in the app

### Test cases

**TC-01 — auth:dropbox script runs and produces a token**
1. Run `npm run auth:dropbox` in the project terminal
2. Expected: browser opens and prompts Dropbox login
3. After authorising: terminal prints `DROPBOX_REFRESH_TOKEN=...`
4. Expected: token is a non-empty string
- [ ] Pass  [ ] Fail

**TC-02 — Token set in Railway and service redeploys healthy**
1. Add `DROPBOX_REFRESH_TOKEN` (and all other required vars) to Railway variables
2. Expected: Railway redeploys the API service and shows green/healthy status
- [ ] Pass  [ ] Fail

**TC-03 — Dropbox status shows Configured**
1. In Blue Leaf Hub → Settings → scroll to the Dropbox section
2. Expected: "Configured: Yes" shown in the status panel
3. Expected: `GET /api/integrations/status` returns `dropbox: { configured: true }`
- [ ] Pass  [ ] Fail

**TC-04 — File upload to Dropbox works**
1. Trigger a Dropbox file upload (e.g. create a new job and observe if the Dropbox folder is created, or upload a compliance document via SOP 08-01)
2. Expected: file appears in Dropbox under the correct project folder path
3. Expected: no upload error shown in the app
- [ ] Pass  [ ] Fail

**TC-05 — Invalid token produces an informative error**
1. Temporarily set `DROPBOX_REFRESH_TOKEN` to `"invalid"` in Railway → redeploy
2. Attempt a file upload in the app
3. Expected: a clear "Dropbox upload failed" or "Invalid refresh token" message in the app — not a raw Dropbox API error or unhandled 500
4. Restore the correct token after the test
- [ ] Pass  [ ] Fail

**TC-06 — Sequential file reads handle Smart Sync files**
1. Ensure at least one file in the relevant Dropbox folder is online-only (Smart Sync)
2. Trigger a file read operation in the app that reads from that folder
3. Expected: file is read successfully — sequential for-loop handles it without timeout or concurrent-read error
4. Expected: no 409 or "too_many_requests" error from Dropbox
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] auth:dropbox script generates a valid token
- [ ] Token set in Railway and service shows healthy status
- [ ] Status panel confirms Configured: Yes
- [ ] File upload lands in the correct Dropbox folder path
- [ ] Invalid token handled with plain English error
- [ ] No console errors observed during testing
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

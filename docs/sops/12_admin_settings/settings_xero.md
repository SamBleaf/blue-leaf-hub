---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP 12-05: Connect Xero Integration

**Module:** Admin Settings — Integrations  
**SOP ID:** 12-05  
**Status:** Draft  
**Priority:** Low

---

## 1. Who uses this
Admin only. This integration is not yet built — it is planned for Stage 3 of development.

## 2. When to use it
This SOP will be used when the Xero integration is built. It is documented now so the workflow is defined before development begins.

## 3. What this does (planned)
Will connect Blue Leaf Hub to your Xero accounting account. Once connected:
- Approved invoices from the Finance module will sync to Xero automatically
- Xero invoice status (paid/unpaid) will update in Blue Leaf Hub
- Progress claims and variations will be pushable to Xero as draft invoices
- Bank reconciliation data may be available for cashflow forecasting

**Current status: Not yet built — planned for Stage 3.**

## 4. Before you start (planned)
- You have a Xero account with admin access
- Blue Leaf Hub is set up and running
- You have a Xero API client ID and secret (from Xero Developer portal)

## 5. Step-by-step process (planned)

1. Go to **Settings** in the sidebar
2. Scroll to the **Integrations** section → **Xero**
3. Click **Connect to Xero**
4. You will be redirected to Xero's login page — log in with your Xero credentials
5. Xero will ask you to authorise Blue Leaf Hub to access your account — click **Allow**
6. You are redirected back to Blue Leaf Hub
7. Expected: "Connected to Xero" confirmation with your organisation name shown
8. Select which Xero account codes map to which Blue Leaf cost categories
9. Click **Save configuration**

## 6. What happens next (planned)
- Xero OAuth tokens are stored securely in the app's environment (Railway env vars)
- Invoice sync runs automatically when invoices are approved in the Finance module
- A "Push to Xero" button will appear on relevant Finance screens

## 7. Common mistakes (planned)

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Authorising with the wrong Xero organisation | Multiple Xero orgs under one login | Check the organisation name shown in the Xero authorisation screen before clicking Allow |
| Not mapping account codes | Skipping the configuration step | Account code mapping is required for invoices to sync to the correct Xero accounts |

## 8. Troubleshooting (planned)

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| OAuth redirect fails | Redirect URL mismatch | Check that the redirect URL in the Xero Developer portal matches the Blue Leaf Hub URL exactly |
| "Xero not configured" message | Integration not yet built or not connected | The integration is not yet built — refer to Finance module for manual invoice tracking in the interim |
| Token expired | Xero tokens expire after 60 days of inactivity | Reconnect via Settings → Integrations → Xero → Disconnect then reconnect |

## 9. Related modules
- [Connect Dropbox integration](settings_dropbox.md) — SOP 12-06
- Finance module SOPs (09_finance)

## 10. Screenshot placeholders
[insert screenshot: Settings page Xero section showing "Not connected" state with a Connect to Xero button]
[insert screenshot: Xero OAuth authorisation screen in the browser]
[insert screenshot: Settings page after successful connection showing "Connected to [Organisation Name]"]

## 11. Automation notes
- **Not yet built — planned for Stage 3**
- Planned approach: Xero OAuth 2.0 flow; tokens stored as Railway environment variables or in Supabase
- Planned API: `POST /api/settings/xero/connect` (OAuth callback), `GET /api/settings/xero/status`
- Status check can be surfaced via the existing `GET /api/integrations/status` endpoint (add `xero` key when built)
- When built: will use Xero API to create/update invoices and retrieve payment status
- No current DB effects — schema to be designed in Stage 3

## 12. Edge cases and limits
- **Not yet built** — all edge cases below are planned for when the integration is developed
- Xero tokens expire after 60 days of inactivity — a renewal reminder or auto-refresh must be implemented
- If multiple Xero organisations are under one login, the wrong one may be connected — require explicit selection at setup
- If account code mapping is skipped, invoice sync must queue or fail gracefully rather than creating unmapped records in Xero
- Disconnect must clear all tokens — a partial disconnect (token left in env var) should be detected and handled

## 13. Owner of the process
Admin  
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.
>
> **Note: These test cases are written for when the Xero integration is built. They cannot be run until Stage 3 is complete.**

### Pre-test setup
- [ ] Xero integration has been built (Stage 3 complete)
- [ ] A Xero sandbox account exists for testing
- [ ] Log in as Admin

### Test cases

**TC-01 — Connect to Xero (OAuth flow)**
1. Settings → Integrations → Xero → click Connect to Xero
2. Expected: redirect to Xero login page
3. Log in with test Xero credentials → click Allow
4. Expected: redirect back to Blue Leaf Hub with "Connected" confirmation shown
- [ ] Pass  [ ] Fail

**TC-02 — Xero organisation name shown after connection**
1. After TC-01, check the Settings → Integrations → Xero section
2. Expected: Xero section shows "Connected to [Organisation Name]"
3. Expected: `GET /api/integrations/status` returns `xero: { connected: true, organisation: '...' }`
- [ ] Pass  [ ] Fail

**TC-03 — Approved invoice syncs to Xero**
1. Approve an invoice in the Finance module
2. Check the Xero sandbox account
3. Expected: invoice appears in Xero as a draft bill with matching amount, supplier, and date
- [ ] Pass  [ ] Fail

**TC-04 — Disconnecting Xero removes access**
1. Settings → Integrations → Xero → click Disconnect
2. Expected: tokens are cleared from Railway env vars or Supabase
3. Expected: subsequent sync attempts fail gracefully with "Xero not connected" message (not a crash)
- [ ] Pass  [ ] Fail

**TC-05 — Non-admin cannot access Xero settings**
1. Log out and log in as a Staff-role user
2. Navigate to Settings → Integrations → Xero
3. Expected: Xero integration settings are inaccessible or read-only for Staff role
- [ ] Pass  [ ] Fail

**TC-06 — Status endpoint returns correct connection state**
1. With Xero connected: call `GET /api/integrations/status`
2. Expected (connected): `{ ok: true, xero: { connected: true, organisation: '...' } }`
3. With Xero disconnected: call `GET /api/integrations/status`
4. Expected (not connected): `{ ok: true, xero: { connected: false } }`
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] OAuth flow completes successfully end-to-end
- [ ] Connected organisation name shown correctly
- [ ] Invoice sync works end-to-end to Xero sandbox
- [ ] Disconnect clears access and fails gracefully
- [ ] Non-admin cannot modify Xero settings
- [ ] No console errors observed during testing
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

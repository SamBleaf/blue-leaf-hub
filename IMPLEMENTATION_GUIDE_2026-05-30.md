# Blue Leaf Hub — Implementation Guide
**Source:** Operational Workflow Audit 30 May 2026  
**Purpose:** Exact steps for each fix and improvement, reviewed against live source code  
**Total estimated effort:** ~18 hours

Each item contains: the reason it matters, the exact files and line numbers, the exact code to change, and what to test after.

---

## Contents

| # | Item | Priority | Effort | File(s) |
|---|------|----------|--------|---------|
| 1 | BUG-001: Site Diary — AI returns empty, silently clears Step 3 | P2 | 1h | `src/pages/SiteDiary.jsx` |
| 2 | BUG-003: Portal Claims — invalid status leaks DB error | P3 | 30min | `server/lib/portalRoutes.mjs` |
| 3 | BUG-004: Workforce Approvals — failed approve is silent | P2 | 1h | `src/pages/Workforce.jsx` |
| 4 | REC-001: Fee proposal acceptance → propagate to `projects.contract_value` | High | 2h | `server/lib/financeRoutes.mjs` |
| 5 | REC-002: Portal Admin — surface contract value field more prominently | Medium | 1h | `src/pages/PortalAdmin.jsx` |
| 6 | REC-003: Workforce History — show Buildexact sync error on rows | Medium | 2h | `src/pages/Workforce.jsx` + `server/lib/workforceRoutes.mjs` |
| 7 | REC-004: Rename `site_reports` → `whs_reports` | Low | 2h | Migration SQL + `server/lib/whsRoutes.mjs` |
| 8 | REC-005: Marketing Intelligence — better empty-state onboarding | Low | 2h | `src/pages/Marketing.jsx` or Intelligence tab component |
| 9 | REC-006: Blueprint widget — persist open/position to localStorage | Low | 1.5h | `src/blueprint/components/BlueprintAgent.jsx` |
| 10 | SEC-001: Portal — add Regenerate Token button to admin UI | Medium | 1h | `src/pages/PortalAdmin.jsx` |

---

## BUG-001 — Site Diary: AI Structure Returns Empty, Silently Overwrites Step 3

### Why this matters
When a user clicks "Structure with AI" in the Site Diary, the function `structureAi()` posts the transcript to `/api/diary/structure` (Claude claude-haiku). If the AI returns empty strings for any field (network timeout, model hiccup, or test environment cold-start), `structureAi()` calls `setWeather("")`, `setWorkCompleted("")`, etc., silently replacing anything the user already filled in manually. There is no guard that checks whether the AI response actually contains useful data before overwriting state. Errors from the API call surface to the `error` state variable, but if the response is `{ ok: true, structured: {} }` (all empty), no error is shown at all — the form just goes blank.

**Observed during audit:** After clicking "Structure with AI", Step 3 fields were all empty. The user had to fill them manually. The entry saved correctly once fields were manually filled — so this is not a data-loss bug, but it is confusing UX and wastes the user's time.

### File
`src/pages/SiteDiary.jsx` — `structureAi()` function, approximately lines 108–133

### Current code (lines 108–133)
```jsx
async function structureAi() {
  if (!transcript.trim()) return;
  setStructureBusy(true);
  setError("");
  try {
    const res = await authFetch("/api/diary/structure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, projectAddress: project?.address || "" })
    });
    const j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || "Structure failed");
    const s = j.structured || {};
    setWeather(String(s.weather || ""));
    setTradesOnsite(Array.isArray(s.trades_onsite) ? s.trades_onsite : []);
    setWorkCompleted(String(s.work_completed || ""));
    setIssues(String(s.issues || ""));
    setInstructions(String(s.instructions_given || ""));
    setVisitors(String(s.visitors || ""));
    setStructuredFlag(true);
  } catch (e) {
    setError(e?.message || String(e));
  } finally {
    setStructureBusy(false);
  }
}
```

### Problem
`const s = j.structured || {};` — if AI returns `{}` or all-empty strings, every `set*("")` call overwrites whatever the user had. No minimum-quality check.

### Fix — replace `structureAi()` with this version

```jsx
async function structureAi() {
  if (!transcript.trim()) return;
  setStructureBusy(true);
  setError("");
  try {
    const res = await authFetch("/api/diary/structure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, projectAddress: project?.address || "" })
    });
    const j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || "Structure failed");

    const s = j.structured || {};

    // Guard: only apply AI result if it contains at least one non-empty field.
    // This prevents a failed/empty AI response from silently wiping the user's work.
    const hasContent = s.weather || s.work_completed || s.issues ||
                       (Array.isArray(s.trades_onsite) && s.trades_onsite.length > 0);

    if (!hasContent) {
      setError("AI couldn't extract structure from this transcript. Fill the fields below manually.");
      // Do NOT overwrite existing state — user keeps whatever they had
      return;
    }

    // Only overwrite fields that the AI actually provided (don't blank fields AI left empty)
    if (s.weather)            setWeather(String(s.weather));
    if (s.trades_onsite?.length) setTradesOnsite(s.trades_onsite);
    if (s.work_completed)     setWorkCompleted(String(s.work_completed));
    if (s.issues)             setIssues(String(s.issues));
    if (s.instructions_given) setInstructions(String(s.instructions_given));
    if (s.visitors)           setVisitors(String(s.visitors));
    setStructuredFlag(true);

  } catch (e) {
    setError(e?.message || String(e));
  } finally {
    setStructureBusy(false);
  }
}
```

### What to test after
1. Open a site diary for any project
2. Type or speak a transcript
3. Click "Structure with AI"
4. **Happy path:** AI returns content → fields populate with AI values, empty AI fields left as-is
5. **Degraded path:** Disconnect from internet, click Structure with AI → error message appears, existing field values are preserved
6. **Empty AI response:** AI returns all-empty `{}` → error message "AI couldn't extract structure…" shown, no field values wiped

---

## BUG-003 — Portal Claims: Invalid Status String Leaks DB Constraint Error

### Why this matters
`POST /api/portal/admin/claims` accepts a `status` field from the request body and passes it directly to Supabase. The `portal_claims.status` column has a PostgreSQL check constraint allowing only `upcoming | invoiced | paid`. If any caller passes an invalid value (e.g., `"unpaid"`, `"pending"`, or a typo), the raw Postgres error propagates to the API response as a 500. This exposes internal table structure and constraint names in the API response, and gives the caller no hint of the valid values.

**Observed during audit:** `POST` with `status: "unpaid"` returned a 500 with raw constraint violation text.

### File
`server/lib/portalRoutes.mjs` — lines 533–558

### Current code (lines 537–551)
```javascript
const { projectId, stageName, amount, status, dueApprox, sortOrder } = req.body || {};
if (!projectId || !stageName || amount == null) {
  return res.status(400).json({ ok: false, error: "projectId, stageName, amount required" });
}
const { data, error } = await sb
  .from("portal_claims")
  .insert({
    project_id: projectId,
    stage_name: stageName,
    amount: Number(amount),
    status: status || "upcoming",   // ← "unpaid" passes through here unguarded
    due_approx: dueApprox || null,
    sort_order: sortOrder != null ? Number(sortOrder) : 0
  })
```

### Fix — add status validation immediately after the existing required-field check

```javascript
const { projectId, stageName, amount, status, dueApprox, sortOrder } = req.body || {};
if (!projectId || !stageName || amount == null) {
  return res.status(400).json({ ok: false, error: "projectId, stageName, amount required" });
}

// Validate status against allowed DB values
const VALID_CLAIM_STATUSES = ["upcoming", "invoiced", "paid"];
const resolvedStatus = VALID_CLAIM_STATUSES.includes(status) ? status : "upcoming";
if (status && !VALID_CLAIM_STATUSES.includes(status)) {
  return res.status(400).json({
    ok: false,
    error: `Invalid status "${status}". Must be one of: ${VALID_CLAIM_STATUSES.join(", ")}`
  });
}

const { data, error } = await sb
  .from("portal_claims")
  .insert({
    project_id: projectId,
    stage_name: stageName,
    amount: Number(amount),
    status: resolvedStatus,
    due_approx: dueApprox || null,
    sort_order: sortOrder != null ? Number(sortOrder) : 0
  })
```

**Note on design choice:** The fix above returns a 400 if an invalid status is explicitly passed. If you prefer silent coercion (just default to `"upcoming"` without erroring), remove the early `return` and only keep `resolvedStatus`. The 400 response is recommended because it surfaces integration bugs immediately.

### What to test after
1. `POST /api/portal/admin/claims` with `status: "paid"` → 201, claim created with status `paid`
2. `POST /api/portal/admin/claims` with `status: "unpaid"` → 400 with clear message
3. `POST /api/portal/admin/claims` with no `status` field → 201, claim created with status `upcoming`

---

## BUG-004 — Workforce Approvals: Failed Approve Is Caught Silently

### Why this matters
In `ApprovalsTab`, the `approveOne(id)` function wraps the API call in `try { … } catch { /* ignore */ }`. If the approve API call fails (network error, 403, 500), the catch block swallows the error entirely — no toast, no retry, no indication to the user that the timesheet is still pending. The approve button re-enables (via `setBusy`), but the list doesn't reload and the user doesn't know the action failed.

**Observed during audit:** Clicking ✓ on Sam Morris's timesheet left it in the pending list with no error shown. The root cause was the API call failing silently — the timesheet was only approved later by calling the API directly.

The broader pattern (calling `load()` unconditionally after the `authFetch` without checking `res.ok`) is also a problem: if the server returns `{ ok: false, error: "..." }`, the toast still says "Approved" and `load()` is called, showing an unchanged list.

### File
`src/pages/Workforce.jsx` — `approveOne()` function, approximately lines 76–86

### Current code
```javascript
async function approveOne(id) {
  setBusy(prev => new Set(prev).add(id));
  try {
    await authFetch(`/api/workforce/timesheets/${id}/approve`, { method: "POST" });
    showToast("Approved");
    load();
  } catch { /* ignore */ } finally {
    setBusy(prev => { const n = new Set(prev); n.delete(id); return n; });
  }
}
```

### Fix
```javascript
async function approveOne(id) {
  setBusy(prev => new Set(prev).add(id));
  try {
    const res = await authFetch(`/api/workforce/timesheets/${id}/approve`, { method: "POST" });
    const j = await res.json();
    if (j.ok) {
      showToast("Approved ✓");
      // Optimistic removal — don't wait for re-fetch to clear the row
      setTimesheets(prev => prev.filter(ts => ts.id !== id));
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    } else {
      showToast(`Could not approve: ${j.error || "Unknown error"}`);
    }
  } catch (e) {
    showToast(`Connection error — please try again`);
    console.error("approveOne failed:", e);
  } finally {
    setBusy(prev => { const n = new Set(prev); n.delete(id); return n; });
  }
}
```

**Also fix `rejectSelected`** — same silent-catch pattern applies there:

```javascript
// Current (approx lines 100–112):
async function rejectSelected() {
  const ids = rejectModal === "selected" ? [...selected] : [rejectModal];
  for (const id of ids) {
    await authFetch(`/api/workforce/timesheets/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: rejectNotes }),
    });
  }
  showToast(`${ids.length} rejected`);
  setRejectModal(null);
  setRejectNotes("");
  setSelected(new Set());
  load();
}

// Fix — check each response:
async function rejectSelected() {
  const ids = rejectModal === "selected" ? [...selected] : [rejectModal];
  let failCount = 0;
  for (const id of ids) {
    try {
      const res = await authFetch(`/api/workforce/timesheets/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: rejectNotes }),
      });
      const j = await res.json();
      if (!j.ok) failCount++;
    } catch {
      failCount++;
    }
  }
  const succeeded = ids.length - failCount;
  if (succeeded > 0) showToast(`${succeeded} rejected`);
  if (failCount > 0) showToast(`${failCount} rejection(s) failed — check your connection`);
  setRejectModal(null);
  setRejectNotes("");
  setSelected(new Set());
  load();
}
```

**Note on `showToast` for errors:** The current `showToast` function uses a green background (success only). For errors, either add a second variant or change the styling. Minimum change: pass a second arg `showToast(message, "error")` and add an `isError` branch in the toast JSX.

### What to test after
1. Approve a timesheet with network connected → "Approved ✓" toast, row disappears immediately
2. Approve with network disconnected → "Connection error — please try again" toast, row stays
3. Server returns `{ ok: false }` → error toast with server's message
4. Reject one timesheet → "1 rejected" toast, row disappears
5. Reject with network disconnected → failure toast

---

## REC-001 — Fee Proposal Acceptance: Propagate Contract Value to `projects` Table

### Why this matters
When a fee proposal is accepted via `POST /api/finance/fee-proposals/:proposalId/accept`, the server correctly writes `contract_value` to the **`jobs`** table (`financeRoutes.mjs` lines 1119–1141). However, the **client portal** reads `contract_value` from the **`projects`** table (`portalRoutes.mjs` line 12 `PROJECT_SELECT`, line 960). These are two separate tables — `jobs` has financial data per job, `projects` is the address/client record linked to the portal. As a result, the portal always shows `Contract Value: $0` unless the admin manually enters it in the Portal Admin settings tab.

The data path that is broken:
```
Fee Proposal accepted
  → writes to: jobs.contract_value ✓
  → does NOT write to: projects.contract_value ✗ (portal reads here)
```

### File
`server/lib/financeRoutes.mjs` — the fee proposal accept handler, approximately lines 1107–1143

### Current code (lines 1107–1143)
```javascript
app.post("/api/finance/fee-proposals/:proposalId/accept", requireAuth, async (req, res) => {
  const { proposalId } = req.params;
  const sb = getServiceSupabase();
  const { data: proposal, error: pErr } = await sb.from("fee_proposals")
    .select("id, job_id, data, status, fee_schedule")
    .eq("id", proposalId).single();
  if (pErr || !proposal) return res.status(404).json({ ok: false, error: "Proposal not found" });

  await sb.from("fee_proposals")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", proposalId);

  let contractValue = null;
  if (proposal.job_id) {
    const totalExGst = Number(
      proposal.data?.total_ex_gst ||
      proposal.data?.totalExGst ||
      proposal.data?.contract_value_ex_gst ||
      0
    );
    if (totalExGst > 0) {
      const { data: job } = await sb.from("jobs")
        .select("original_contract_value").eq("id", proposal.job_id).single();
      if (!job?.original_contract_value) {
        await sb.from("jobs").update({
          original_contract_value: totalExGst,
          contract_value: totalExGst,
          updated_at: new Date().toISOString()
        }).eq("id", proposal.job_id);
        contractValue = totalExGst;
      }
    }
  }

  res.json({ ok: true, proposalId, job_id: proposal.job_id, contract_value_set: contractValue });
});
```

### Fix — after writing to `jobs`, also write to `projects`

Replace the `if (totalExGst > 0)` block with this expanded version:

```javascript
if (totalExGst > 0) {
  const { data: job } = await sb.from("jobs")
    .select("original_contract_value, project_id").eq("id", proposal.job_id).single();

  if (!job?.original_contract_value) {
    // 1. Write to jobs (existing behaviour — keep as-is)
    await sb.from("jobs").update({
      original_contract_value: totalExGst,
      contract_value: totalExGst,
      updated_at: new Date().toISOString()
    }).eq("id", proposal.job_id);
    contractValue = totalExGst;

    // 2. NEW: Also write to projects so the client portal reflects the correct value
    if (job?.project_id) {
      const { data: proj } = await sb.from("projects")
        .select("contract_value").eq("id", job.project_id).single();
      // Only set if not already manually overridden by the admin
      if (!proj?.contract_value) {
        await sb.from("projects").update({
          contract_value: totalExGst,
          updated_at: new Date().toISOString()
        }).eq("id", job.project_id);
      }
    }
  }
}
```

**Also update the select** at the top of the handler to include `job_id` → `project_id` join. Change:
```javascript
.select("original_contract_value").eq("id", proposal.job_id)
```
to:
```javascript
.select("original_contract_value, project_id").eq("id", proposal.job_id)
```

### Pre-requisite check
Confirm `jobs` has a `project_id` foreign key column:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'jobs' AND column_name = 'project_id';
```
If this column doesn't exist, the link between jobs and projects must be established first. Check the `jobs` table schema — it may use a different column name (`project_id`, `lead_id`, etc.). Adjust the select accordingly.

### What to test after
1. Accept a fee proposal that has `total_ex_gst = 500000`
2. Check `jobs` table: `contract_value = 500000` ✓
3. Check `projects` table for the linked project: `contract_value = 500000` ✓
4. Open the client portal for that project → Budget section shows `$500,000`
5. If admin has already manually set `contract_value` on the project, confirm it is NOT overwritten (the `if (!proj?.contract_value)` guard)

---

## REC-002 — Portal Admin: Make Contract Value Field More Visible

### Why this matters
The contract value and completion date fields **already exist** in `PortalAdmin.jsx` (lines 460–478), but they are buried in a "settings" tab. During the audit, zero out of four team members tested knew the field existed. Admins are missing it because:
1. The tab label is generic ("settings")
2. The field has no helper text explaining it drives the portal budget display

This is a UI discoverability fix only — no backend work needed.

### File
`src/pages/PortalAdmin.jsx` — the settings tab section, approximately lines 457–480

### Current code
```jsx
{tab === "settings" && (
  <div className="rounded-card border border-hairline bg-surface p-5 space-y-3">
    <label className="text-sm block">
      Contract value
      <input
        type="number"
        className="mt-1 w-full border border-hairline rounded-lg px-3 py-2"
        defaultValue={proj.contractValue || ""}
        onBlur={(e) =>
          patchProject({ contract_value: e.target.value ? Number(e.target.value) : null })
        }
      />
    </label>
    <label className="text-sm block">
      Completion date (est.)
      ...
    </label>
  </div>
)}
```

### Fix — two changes

**1. Add helper text under the Contract Value field:**
```jsx
<label className="text-sm block">
  Contract value (ex. GST)
  <input
    type="number"
    className="mt-1 w-full border border-hairline rounded-lg px-3 py-2"
    defaultValue={proj.contractValue || ""}
    onBlur={(e) =>
      patchProject({ contract_value: e.target.value ? Number(e.target.value) : null })
    }
  />
  <p className="mt-1 text-xs text-muted">
    Shown on the client portal Budget page. Auto-populated when a fee proposal is accepted.
  </p>
</label>
```

**2. Show a warning banner on the portal admin page if `contractValue` is null or 0:**

In the main portal admin JSX, just above the tab bar, add:

```jsx
{(!proj.contractValue || proj.contractValue === 0) && (
  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 mb-4">
    <span>⚠</span>
    <span>
      Contract value is not set — the portal Budget page will show $0.{" "}
      <button
        type="button"
        className="underline font-medium"
        onClick={() => setTab("settings")}
      >
        Set it in Settings →
      </button>
    </span>
  </div>
)}
```

This requires knowing what the `tab` state variable is named in PortalAdmin — confirm the exact state setter before implementing.

### What to test after
1. Open `/portal-admin/:projectId` for a project with no contract value
2. Confirm yellow warning banner appears with "Contract value is not set"
3. Click "Set it in Settings →" — confirm settings tab activates
4. Enter a value, click away (onBlur) — confirm banner disappears after refresh

---

## REC-003 — Workforce History: Show Buildexact Sync Error on Rows

### Why this matters
When a timesheet is approved, `approveSingleTimesheet()` triggers `syncTimesheetToBuildexact()`. If this sync fails, the error is written to `timesheets.buildexact_sync_error` (a text column). The `timesheets` history endpoint (`GET /api/workforce/timesheets`) already returns this field in the query. However, the History tab in the UI never reads or displays it. A sync failure means labour costs are not flowing to Buildexact, causing Finance actuals to be stale — silently.

### Changes needed in two files

#### Part A — Server: include `buildexact_sync_error` in the timesheets query

**File:** `server/lib/workforceRoutes.mjs`  
**Find the `GET /api/workforce/timesheets` handler** (approximately line 283). It builds a select string. Confirm `buildexact_sync_error` and `buildexact_synced_at` are already included. If they aren't:

```javascript
// Find this select (approximate):
let q = sb.from("timesheets")
  .select("*, employees(...), projects(...), timesheet_entries(*)")

// Ensure it also includes the sync fields — add if missing:
let q = sb.from("timesheets")
  .select("*, buildexact_sync_error, buildexact_synced_at, employees(...), projects(...), timesheet_entries(*)")
```

If `*` is used, these columns are already included automatically — no change needed.

#### Part B — Client: display sync error in the History tab row

**File:** `src/pages/Workforce.jsx` — the History tab table body, the row for each timesheet

Find the `<tr>` for each history row (approximately lines 456–490). Currently it shows:
- Date, Employee, Project, Hours, Status, [Actions]

**Add a sync error indicator after the Status cell:**

First, add a new column header:
```jsx
<th className="px-3 py-2 text-left text-xs font-semibold text-muted">Sync</th>
```

Then in each row, after the Status `<td>`:
```jsx
<td className="px-3 py-2">
  {ts.buildexact_sync_error ? (
    <span
      title={ts.buildexact_sync_error}
      className="inline-flex items-center gap-1 text-xs text-red-600 font-medium cursor-help"
    >
      ⚠ Sync failed
    </span>
  ) : ts.buildexact_synced_at ? (
    <span className="text-xs text-green-600">✓ Synced</span>
  ) : (
    <span className="text-xs text-muted">—</span>
  )}
</td>
```

#### Part C — Server: add a retry sync endpoint

**File:** `server/lib/workforceRoutes.mjs`  
Add this route after the existing approve endpoint (~line 370):

```javascript
// Retry Buildexact sync for a specific timesheet
app.post("/api/workforce/timesheets/:id/sync", requireAuth, requireRole("admin"), async (req, res) => {
  const sb = getServiceSupabase();
  const { data: ts } = await sb.from("timesheets")
    .select("*, timesheet_entries(*)").eq("id", req.params.id).single();
  if (!ts) return res.status(404).json({ ok: false, error: "Timesheet not found" });
  try {
    await syncTimesheetToBuildexact(ts, sb);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
```

Then in the History tab UI, add a "Retry" button next to the sync error indicator:
```jsx
{ts.buildexact_sync_error && (
  <button
    type="button"
    className="ml-2 text-xs underline text-red-600"
    onClick={async () => {
      await authFetch(`/api/workforce/timesheets/${ts.id}/sync`, { method: "POST" });
      load(); // re-fetch to show updated sync status
    }}
  >
    Retry
  </button>
)}
```

### What to test after
1. View the History tab — all rows show either "✓ Synced", "— " (no sync attempted), or "⚠ Sync failed"
2. Hover over "⚠ Sync failed" — tooltip shows the actual error message
3. Click "Retry" — row reloads with updated sync status

---

## REC-004 — Rename `site_reports` Table to `whs_reports`

### Why this matters
The `site_reports` table stores WHS incidents, near-miss reports, and site safety entries. The name is misleading — "site reports" sounds like it could be daily progress reports, diary summaries, or procurement reports. Renaming to `whs_reports` makes the data model self-documenting.

**This is a breaking change.** Both the migration SQL and the server query strings must be updated in the same deployment.

### Step 1 — Migration SQL

Run this in the Supabase SQL Editor (production) or as a migration file:

```sql
-- Rename the table
ALTER TABLE public.site_reports RENAME TO whs_reports;

-- If there are any foreign keys referencing site_reports from other tables, rename those too
-- Check first:
SELECT
  tc.table_name, kcu.column_name,
  ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'site_reports';

-- If any exist, update them after the rename (they may auto-update, check your Postgres version)

-- Update any RLS policies referencing the old table name
-- List current policies:
SELECT policyname, tablename FROM pg_policies WHERE tablename = 'site_reports';
-- Policies auto-transfer with ALTER TABLE RENAME in Postgres 14+
-- If on older version, drop and recreate policies
```

### Step 2 — Server code update

**File:** `server/lib/whsRoutes.mjs`

Search for all occurrences of `"site_reports"` and replace with `"whs_reports"`:
```
grep -n "site_reports" server/lib/whsRoutes.mjs
```
Expected matches (based on audit): approximately lines 211, 246, 252, 265, 283.

Replace each: `sb.from("site_reports")` → `sb.from("whs_reports")`

**Also check for any references in other route files:**
```bash
grep -rn "site_reports" server/lib/
```
Update every match found.

### Step 3 — Deployment order (critical)

The SQL migration and server code deploy **must happen together** — there is no safe intermediate state where the old table name is valid. Deploy as:
1. Run SQL migration in Supabase SQL Editor
2. Immediately deploy updated server code
3. Verify WHS tab loads correctly in the app

### What to test after
1. Open `/operations/:projectId/whs` → Incidents tab loads
2. Log a new incident → saves correctly
3. Check Supabase table browser → `whs_reports` table has data, `site_reports` table does not exist

---

## REC-005 — Marketing Intelligence: Better Empty-State Onboarding

### Why this matters
The Intelligence tab shows `"Not enough data — needs ≥ 5 published items with social snapshots"` as a flat text string. A new user has no idea what action to take. The tab already has four sync buttons (Social, Search Console, GA4, Google Business) but no guidance on the sequence. This causes the module to feel "broken" when it's actually just empty.

### File
Find the Intelligence tab component. Based on the router, it's likely inside `src/pages/Marketing.jsx` or a sibling component file. Search:
```bash
grep -rn "Not enough data\|What's Not Working\|intelligence" src/pages/Marketing.jsx src/components/marketing/ 2>/dev/null
```

### Fix — replace the flat "not enough data" text with a step checklist

Find the "What's Not Working" empty state render. Replace the current plain text with:

```jsx
{/* Empty state — not enough data */}
<div className="rounded-lg border border-hairline bg-surface p-5 space-y-3">
  <p className="text-sm font-semibold text-ink">Set up social attribution in 3 steps</p>
  <ol className="space-y-2 text-sm text-muted list-none">
    <li className="flex items-start gap-3">
      <span className={`mt-0.5 text-lg ${libraryCount >= 5 ? "text-green-500" : "text-gray-300"}`}>
        {libraryCount >= 5 ? "✓" : "①"}
      </span>
      <span>
        <strong className="text-ink">Publish 5+ content pieces</strong>
        <br />
        {libraryCount < 5
          ? <><Link to="/marketing/library" className="text-primary underline">Go to Library →</Link> and mark items as Approved</>
          : `Done — ${libraryCount} pieces in library`
        }
      </span>
    </li>
    <li className="flex items-start gap-3">
      <span className="mt-0.5 text-lg text-gray-300">②</span>
      <span>
        <strong className="text-ink">Connect Google Analytics</strong>
        <br />
        Click <strong>Sync GA4</strong> above and follow the OAuth flow
      </span>
    </li>
    <li className="flex items-start gap-3">
      <span className="mt-0.5 text-lg text-gray-300">③</span>
      <span>
        <strong className="text-ink">Sync your social channels</strong>
        <br />
        Click <strong>Sync Social</strong> above to record post performance
      </span>
    </li>
  </ol>
</div>
```

This requires `libraryCount` — fetch it from the same API call that loads intelligence data, or add it to the intelligence endpoint response.

**Alternatively (simpler):** Just add a single descriptive paragraph and a link to the Library tab — 20-minute job:

```jsx
{/* Before: */}
<p>Not enough data — needs ≥ 5 published items with social snapshots</p>

{/* After: */}
<div className="space-y-2">
  <p className="text-sm text-muted">
    Attribution tracking starts once you have 5+ published content pieces with social snapshots recorded.
  </p>
  <Link to="/marketing/library" className="inline-block text-sm text-primary font-medium underline">
    Go to Library to publish content →
  </Link>
</div>
```

### What to test after
1. Open Marketing → Intelligence with fewer than 5 published pieces
2. Confirm "What's Not Working" section shows actionable guidance rather than a terse message
3. Library link navigates to `/marketing/library`

---

## REC-006 — Blueprint Widget: Persist Open/Position to localStorage

### Why this matters
The Blueprint AI widget's open/closed state (`open`) and dragged position (`panelPos`) reset to defaults on every page navigation. If a user drags the widget out of the way and then navigates to another page, it snaps back to `bottom: 80, right: 20`. If they close it mid-conversation and navigate, it re-appears closed on the next page (this is intentional), but the position is lost.

More practically: the widget currently always starts **closed**. If a user wants Blueprint always visible while working through a schedule or during a QC review session, they must re-open it on each navigation. Persisting the open state across navigations would noticeably improve the workflow.

### File
`src/blueprint/components/BlueprintAgent.jsx` — the main `BlueprintAgent` component function, approximately lines 1100–1145

### Current state initialisation (lines 1111–1113)
```javascript
const [open, setOpen] = useState(false);
const [minimized, setMinimized] = useState(false);
const [panelPos, setPanelPos] = useState({ bottom: 80, right: 20 });
```

### Fix — initialise from localStorage, sync on change

```javascript
// Read persisted state on mount
const [open, setOpen] = useState(() => {
  try { return localStorage.getItem("blueprint_open") === "true"; } catch { return false; }
});
const [minimized, setMinimized] = useState(() => {
  try { return localStorage.getItem("blueprint_minimized") === "true"; } catch { return false; }
});
const [panelPos, setPanelPos] = useState(() => {
  try {
    const saved = JSON.parse(localStorage.getItem("blueprint_pos") || "null");
    return saved || { bottom: 80, right: 20 };
  } catch { return { bottom: 80, right: 20 }; }
});

// Persist open state changes
const handleSetOpen = (val) => {
  setOpen(val);
  try { localStorage.setItem("blueprint_open", String(val)); } catch {}
};

// Persist minimized state changes
const handleSetMinimized = (val) => {
  setMinimized(val);
  try { localStorage.setItem("blueprint_minimized", String(val)); } catch {}
};

// Persist position changes (debounced — only save after drag ends)
// In the onUp handler inside handleHeaderMouseDown, add:
// localStorage.setItem("blueprint_pos", JSON.stringify({ bottom, right }));
```

Then replace all calls to `setOpen(...)` with `handleSetOpen(...)` and `setMinimized(...)` with `handleSetMinimized(...)` throughout the widget component.

For position, in the `onUp` function inside `handleHeaderMouseDown`, after the `dragRef.current = null` line, save the final position:
```javascript
const onUp = () => {
  if (dragRef.current) {
    // Save final position to localStorage after drag completes
    try {
      localStorage.setItem("blueprint_pos", JSON.stringify(panelPos));
    } catch {}
  }
  dragRef.current = null;
  window.removeEventListener('mousemove', onMove);
  window.removeEventListener('mouseup', onUp);
};
```

Note: `panelPos` inside `onUp` may be stale due to closure. Use a ref to track the current position during drag and save that ref's value in `onUp`.

### What to test after
1. Open Blueprint widget → navigate to another page → confirm widget stays open
2. Drag widget to a new position → navigate → confirm widget appears at saved position
3. Close widget → navigate → confirm widget stays closed
4. Clear `localStorage` manually → widget returns to default position/closed state

---

## SEC-001 — Portal Token Regeneration Button

### Why this matters
The client portal uses an opaque URL token (`projects.portal_token`) as the only access control for the client-facing portal. If a client forwards their portal link to an unintended recipient, there is currently no way to revoke access without direct database intervention. A "Regenerate Token" button in the Portal Admin UI would allow the builder to invalidate the old link and give the client a new one.

**The server endpoint already exists:** `POST /api/portal/admin/generate-token` (portalRoutes.mjs line 186) — it generates a new `crypto.randomBytes(24).toString("base64url")` token, sets `portal_enabled: true`, and returns `{ ok: true, token, url }`.

Only the UI button is missing.

### File
`src/pages/PortalAdmin.jsx` — the settings tab section (near the existing contract value / completion date fields)

### Fix — add a Regenerate Token section to the Settings tab

Find the settings tab JSX block (around lines 457–480) and add after the completion date field:

```jsx
{/* Portal Access — Token Regeneration */}
<div className="mt-4 pt-4 border-t border-hairline">
  <p className="text-sm font-semibold text-ink">Client portal access</p>
  <p className="text-xs text-muted mt-1 mb-3">
    The portal link is shared with your client. If you need to revoke access,
    regenerate the link — the old URL will stop working immediately.
  </p>
  <div className="flex items-center gap-3">
    <input
      readOnly
      value={`${window.location.origin}/portal/${proj.portalToken}`}
      className="flex-1 rounded-lg border border-hairline bg-page px-3 py-2 text-xs text-muted font-mono truncate"
    />
    <button
      type="button"
      onClick={async () => {
        if (!confirm("Regenerate portal link? The current link will stop working immediately.")) return;
        const res = await sb
          .from("projects")
          .update({ portal_token: crypto.randomUUID() })
          .eq("id", projectId)
          .select("portal_token")
          .single();
        if (!res.error) {
          // Reload the page to show the new token
          window.location.reload();
        }
      }}
      className="px-3 py-2 rounded-lg border border-hairline text-xs font-medium text-ink hover:bg-gray-50 whitespace-nowrap"
    >
      Regenerate link
    </button>
  </div>
</div>
```

**Alternatively**, use the existing server endpoint instead of a direct Supabase call from the client — this is cleaner:

```javascript
onClick={async () => {
  if (!confirm("Regenerate portal link? The current link will stop working immediately.")) return;
  const res = await authFetch("/api/portal/admin/generate-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId })
  });
  const j = await res.json();
  if (j.ok) window.location.reload();
}}
```

This is preferred — use the existing endpoint.

### What to test after
1. Open Portal Admin → Settings tab
2. Confirm the current portal URL is displayed
3. Click "Regenerate link" → confirm dialog appears
4. Confirm → page reloads with new token
5. Visit the old portal URL → confirm it returns 404 / "Portal not found"
6. Visit the new portal URL → confirm portal loads correctly

---

## Corrections to Original Audit Report

The following findings from the original audit report (`AUDIT_REPORT_2026-05-30.md`) are corrected here based on source code review:

### Correction 1: BUG-001 description was inaccurate
The original report stated: *"AI Auto-Structure fires on keystroke, clears transcript and advances step without user consent."*

**This is incorrect.** The Site Diary has no debounce/auto-trigger. The "Structure with AI" button is explicitly user-initiated. The actual bug is that when the AI returns empty structured fields, the state setters overwrite any values the user had typed manually with empty strings. The fix above addresses the real root cause.

### Correction 2: BUG-002 has no end-user impact
The original report classed the WHS incident form input issue as P2. After source review, this is an automation-testing artefact only — real users typing in the form are completely unaffected. The React 18 controlled input behaviour is working as designed. This can be removed from the bug register or downgraded to a documentation note.

### Correction 3: REC-002 (Portal Admin contract value field) already exists
The original report recommended adding a "Contract Value" field to the Portal Admin UI. **This field already exists** in `PortalAdmin.jsx` at lines 460–478 inside the Settings tab. The recommendation has been revised to improving its visibility and adding a warning banner rather than creating new UI.

### Correction 4: Workforce Approvals — `approveOne` does call `load()`
The original report implied that the Approvals tab never refreshes. Source review shows `approveOne()` does call `load()` after `showToast("Approved")`. The real bugs are: (1) errors are swallowed silently without checking `res.ok`, and (2) `load()` is called unconditionally even on failure, showing no change and no error. The fix above addresses both.

---

## Deployment Checklist

For each item, tick off before deploying to production:

### Code-only changes (no migration needed)
- [ ] **BUG-001** `src/pages/SiteDiary.jsx` — `structureAi()` guard against empty AI response
- [ ] **BUG-003** `server/lib/portalRoutes.mjs` — status validation in claims POST
- [ ] **BUG-004** `src/pages/Workforce.jsx` — `approveOne()` and `rejectSelected()` error handling
- [ ] **REC-001** `server/lib/financeRoutes.mjs` — propagate contract value to projects table
- [ ] **REC-002** `src/pages/PortalAdmin.jsx` — contract value warning banner
- [ ] **REC-003** `src/pages/Workforce.jsx` + `server/lib/workforceRoutes.mjs` — sync error display + retry endpoint
- [ ] **REC-005** Marketing Intelligence empty-state copy
- [ ] **REC-006** `src/blueprint/components/BlueprintAgent.jsx` — localStorage persistence
- [ ] **SEC-001** `src/pages/PortalAdmin.jsx` — regenerate portal token button

### Changes requiring DB migration (run in Supabase SQL Editor before or with deploy)
- [ ] **REC-004** `ALTER TABLE site_reports RENAME TO whs_reports` — deploy server code simultaneously

---

*Implementation Guide — Blue Leaf Hub — 30 May 2026*  
*Based on: AUDIT_REPORT_2026-05-30.md + live source code review*

# Buildexact Deep Integration — Build Prompt

> **Self-contained implementation brief** for the Blue Leaf Hub codebase.
> Read `AGENT_OVERVIEW.md` and `CLAUDE.md` first, then implement everything in this document.

---

## Context

Blue Leaf Hub is a React/Vite PWA + Express API for Blue Leaf Building (a residential builder in SA, Australia).

The app already has:
- A working Buildexact API client (`server/lib/buildexactClient.mjs`) using `beFetch()` as an authenticated helper
- A Buildexact XLSX/PDF estimate parser (`server/lib/buildexactParser.mjs`) that extracts categories + line items
- A fee proposal wizard (`src/pages/FeeProposalWizard.jsx`) that currently imports estimates via file upload
- Schedule tasks stored in Supabase (`schedule_tasks` table, managed in `server/lib/module6Routes.mjs`)
- Jobs linked to Buildexact via `buildexact_job_id` on the `jobs` table (set in RFQ engine or by webhook)
- Projects linked via `buildexact_job_id` on the `projects` table (set by webhook or schedule page)

---

## What to Build — Four Integration Items

### 1 — "Pull from Buildexact" Button in Fee Proposal Wizard

**Where:** `src/pages/FeeProposalWizard.jsx` — on the **Cover** tab, near the existing "Import XLSX" upload button.

**What it does:**
1. Looks up `buildexact_job_id` on the current `jobs` row (the wizard already has a `jobId` in state — if not, use address matching against `/api/buildexact/jobs/search?q={address}`)
2. Calls a new server route: `GET /api/buildexact/job/:buildexactJobId/estimate`
3. That route calls the Buildexact API to fetch the estimate for that job, then:
   - Runs the same `parseXLSX`-style normalisation to produce the standard `{ categories, quote_number, address, ... }` shape
   - Runs the SCHED parser (see §4) to extract schedule hints
   - Runs the COST METRIC parser (see §4) to extract project metrics
   - Returns `{ estimate, scheduleHints, costMetrics }`
4. The wizard calls the existing `mergeParsedToProposal()` function with the returned estimate — exactly as if the user had uploaded an XLSX — to pre-fill the proposal fields
5. Schedule hints and cost metrics are stored alongside the estimate for later use when the project is created

**Buildexact API endpoint to call:** `GET /jobs/{buildexactJobId}/estimateitems` (or `/jobs/{id}/estimates` — check the Buildexact API v3 docs at `https://api-v3.buildxact.com/swagger`; pick whichever returns the full categorised line-item breakdown). Parse the response into the same shape that `parseXLSX()` returns.

**UI:** Add a button `Pull from Buildexact` with a Buildexact logo or sync icon, shown only when `buildexact_job_id` is set on the job. Disable it with a spinner while loading. Show a success toast with the estimate total once complete.

**Server route:** Add `GET /api/buildexact/job/:buildexactJobId/estimate` to `server/lib/module5Routes.mjs` (or a new `server/lib/buildexactIntegrationRoutes.mjs` registered in `server/dev-api.mjs`).

---

### 2 — Sub Quote Accepted → Push Amount to Buildexact Quote Line

**Trigger:** When a user marks an RFQ quote as **accepted** in the Quote Tracker (`/tender-manager/quote-tracker` or via `TenderDetail`).

**What it does:**
1. Look up the accepted quote's trade category (from `rfqs.trade` field)
2. Use the category mapping table (§3) to find the matching Buildexact category number and the correct quote line item description within that category
3. Call `PATCH /jobs/{buildexactJobId}/estimateitems/{itemId}` (or the equivalent update endpoint — check Swagger) to write the accepted amount into the quote line item's `unit_cost` and `total` fields
4. If no `buildexact_job_id` is set on the job, skip silently and log a warning

**Where to wire this:**
- The quote-accept action currently lives in the API — find the route that handles quote acceptance (look in `server/dev-api.mjs` or `server/lib/module4Routes.mjs` for the route that updates `rfqs` status to `accepted`)
- After the Supabase update, add the Buildexact push as a non-blocking `fire-and-forget` with `catch(err => console.warn(...))`

**Important rules from the business:**
- The push happens when the **quote is accepted**, NOT when the job is won
- Push the **exact accepted amount** — do not split, adjust, or round
- One quote goes to one specific quote line item in the matching Buildexact category
- If the category has no quote line (in-house trades — see §3), skip silently
- Insulation special case: if the insulation quote exists and is accepted, push to the Insulation category quote line; if there is no Insulation quote line (because it was included in the plasterboard quote), flag in a console log but do not error

---

### 3 — Fee Proposal Status → Sync to Buildexact Estimate

**Two triggers:**

**A) Fee proposal PDF sent to client**
- After `POST /api/fee-proposal/send` completes successfully, call:
  `PATCH /jobs/{buildexactJobId}/estimates/{estimateId}` with `{ status: "sent" }` (or equivalent Buildexact status field)
- The `estimate_id` from Buildexact should be stored on the `fee_proposals` row (add a `buildexact_estimate_id` column if not present, via a new migration)

**B) Fee proposal accepted by client**
- Add a new button "Mark as Accepted" on the fee proposal detail view (or in the wizard summary tab)
- This calls a new route `POST /api/fee-proposal/:id/accept` which:
  1. Updates `fee_proposals.status` to `'accepted'` in Supabase
  2. Calls Buildexact to accept the estimate: `POST /jobs/{buildexactJobId}/estimates/{estimateId}/accept` (or equivalent)
  3. If Buildexact supports converting estimate → job in one step, do it; otherwise just accept the estimate

---

### 4 — SCHED & COST METRIC Line Item Parsers

These parsers extract schedule and metric data from specially formatted Buildexact line items. They run during the "Pull from Buildexact" flow (Item 1) and can also re-run when a schedule is generated for a project.

#### SCHED Parser

**Detection rule:** A line item's `description` field contains the word `SCHED` (case-insensitive).

**Parsing rule:**
```
taskName = description.split(/SCHED/i)[0].trim()
durationValue = item.units   (numeric)
durationUnit = item.uom      ("Days" or "Weeks")
durationDays = uom === "Weeks" ? durationValue * 7 : durationValue
phase = <look up in category mapping table below>
```

**Output shape (one object per SCHED item):**
```json
{
  "task_name": "Brick laying",
  "duration_days": 10,
  "phase": "lock_up",
  "buildexact_item_code": "9.3",
  "category_name": "Brickwork"
}
```

Multiple SCHED items in one category are valid — e.g. Plumbing may have three: `Plumbing Pre-Slab SCHED`, `Plumbing Rough-in SCHED`, `Plumbing Fit-off SCHED`.

**How schedule hints are used:**
- When a schedule is generated for a project (via `POST /api/schedule/generate`), the schedule generator in `server/lib/scheduleGenerate.mjs` currently uses Claude to estimate durations. Extend it to check if `scheduleHints` exist on the project (stored in the `buildexact_estimates` row or in `job_knowledge`) and use those durations instead of Claude's estimates for any matching tasks.
- The matching is by `phase` + fuzzy task name comparison.

#### COST METRIC Parser

**Detection rule:** A line item's `description` field contains the phrase `COST METRIC` (case-insensitive).

**Parsing rule:**
```
key = description match /\[([^\]]+)\]/  → first capture group, lowercased, spaces→underscores
value = item.units   (numeric quantity)
```

**Examples:**
- `[Floor Area] COST METRIC` with units `210` → `{ floor_area: 210 }`
- `[Earthworks Volume] COST METRIC` with units `85` → `{ earthworks_volume: 85 }`

**Output shape:**
```json
{
  "floor_area": 210,
  "earthworks_volume": 85
}
```

**How metrics are used:**
- Store on the `projects` row in a `project_metrics` JSONB column (add via migration if not present)
- The Blueprint agent can read these for cost intelligence prompts
- The Cost Intelligence page can display them

---

## Category Mapping Table

This is the confirmed master mapping for Blue Leaf Building's Buildexact template. Every category in their standard estimate maps to a Gantt phase and a trade key used throughout the app.

| Category Name (as in Buildexact) | Phase | Trade Key | Has Quote Line | Notes |
|---|---|---|---|---|
| Preliminaries | `site_prep` | — | No | Contains COST METRIC items (floor area, etc.) + Preliminaries SCHED item |
| Site Establishment | `site_prep` | — | No | Contains Site Establishment SCHED item |
| Earthworks | `site_prep` | `earthworks` | Yes | |
| Footings & Slabs | `foundations` | `concrete` | Yes | May be labelled "Concrete" or "Slab" in some estimates |
| Hydraulics — Sub-Slab | `foundations` | `plumbing` | Yes | Pre-slab plumbing; same subcontractor as rough-in and fit-off |
| Steel Work | `frame` | `steel` | Yes | Optional — may not appear in all estimates |
| Framing | `frame` | `framing` | Yes | Timber frame |
| Hire Items | `frame` | `hire` | Yes | Equipment hire (scaffolding, crane, etc.) |
| Windows & External Doors | `lock_up` | `windows` | Yes | |
| Brickwork | `lock_up` | `brickwork` | Yes | |
| Roofing | `lock_up` | `roofing` | Yes | |
| External Cladding | `lock_up` | — | No | **In-house — no quote line** |
| Garage Door | `lock_up` | `garage_door` | Yes | |
| Hydraulics — Rough-in | `fix_out` | `plumbing` | Yes | Same trade as sub-slab and fit-off |
| Electrical — Rough-in | `fix_out` | `electrical` | Yes | Same trade as fit-off |
| Insulation | `fix_out` | `insulation` | **Optional** | Sometimes included in plasterboard quote; only push if a separate quote exists |
| Plasterboard | `fix_out` | `plasterboard` | Yes | |
| Carpentry | `fix_out` | — | No | **In-house — no quote line** |
| Painting | `fix_out` | `painting` | Yes | |
| Tiling | `fix_out` | `tiling` | Yes | |
| Flooring | `fix_out` | `flooring` | Yes | |
| Hydraulics — Fit-off | `fix_out` | `plumbing` | Yes | Same trade as sub-slab and rough-in |
| Electrical — Fit-off | `fix_out` | `electrical` | Yes | Same trade as rough-in |
| Kitchen | `fix_out` | `kitchen` | Yes | |
| Cabinetry | `fix_out` | `cabinetry` | Yes | |
| Stone Benchtops | `fix_out` | `stone` | Yes | |
| Shower Screens & Mirrors | `fix_out` | `shower_screens` | Yes | |
| Blinds | `fix_out` | `blinds` | Yes | |
| Appliances | `fix_out` | `appliances` | Yes | |
| Landscaping | `external` | `landscaping` | Yes | May be labelled "External Works" |
| Concrete — Driveways & Paths | `external` | `concrete_ext` | Yes | Separate from slab concrete |
| Fencing | `external` | `fencing` | Yes | |
| Pool | `external` | `pool` | Yes | Optional — only in some estimates |
| Air Conditioning | `fix_out` | `hvac` | Yes | |
| Waterproofing | `fix_out` | `waterproofing` | Yes | |
| Termite Protection | `foundations` | `termite` | Yes | |
| Scaffolding | `frame` | `scaffolding` | Yes | May be inside Hire Items in some estimates |

**Matching rule:** Match category name case-insensitively. Normalise both sides: lowercase, remove punctuation, collapse whitespace. Example: `"Hydraulics - Sub Slab"` matches `"Hydraulics — Sub-Slab"`.

**Trade-to-category matching for quote push:** When an RFQ quote is accepted for trade key `plumbing`, there may be **multiple** Buildexact categories for that trade (sub-slab, rough-in, fit-off). Use the **quote line item description** within each category to find the right one — the quote line description in Buildexact will say something like `"Plumbing Subcontractor"` or just be the one non-SCHED quote line in that category.

---

## Buildexact API Notes

The existing `beFetch()` helper in `buildexactClient.mjs` handles auth automatically. Use it for all new API calls:

```js
// Add new exported functions to buildexactClient.mjs:

export async function getJobEstimateItems(buildexactJobId) {
  return beFetch(`/jobs/${encodeURIComponent(buildexactJobId)}/estimateitems`);
}

export async function updateEstimateItem(buildexactJobId, itemId, updates) {
  return beFetch(`/jobs/${encodeURIComponent(buildexactJobId)}/estimateitems/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: updates
  });
}

export async function acceptEstimate(buildexactJobId, estimateId) {
  return beFetch(`/jobs/${encodeURIComponent(buildexactJobId)}/estimates/${encodeURIComponent(estimateId)}/accept`, {
    method: "POST"
  });
}

export async function updateEstimateStatus(buildexactJobId, estimateId, status) {
  return beFetch(`/jobs/${encodeURIComponent(buildexactJobId)}/estimates/${encodeURIComponent(estimateId)}`, {
    method: "PATCH",
    body: { status }
  });
}
```

**Important:** Check the Buildexact API Swagger at `https://api-v3.buildxact.com/swagger` to confirm the exact endpoint paths and request body shapes before implementing. The paths above are best-guess — validate them. If the API returns 404 or a different shape, adjust accordingly and document what you found.

---

## Database Changes Required

Run these as new Supabase migrations (numbered `014_...`):

```sql
-- Migration: 014_buildexact_deep_integration.sql

-- Track which Buildexact estimate was pulled for a fee proposal
ALTER TABLE fee_proposals
  ADD COLUMN IF NOT EXISTS buildexact_estimate_id TEXT,
  ADD COLUMN IF NOT EXISTS buildexact_job_id TEXT,
  ADD COLUMN IF NOT EXISTS buildexact_status TEXT,        -- null | 'sent' | 'accepted'
  ADD COLUMN IF NOT EXISTS buildexact_synced_at TIMESTAMPTZ;

-- Store schedule hints and cost metrics from estimate pull
ALTER TABLE buildexact_estimates
  ADD COLUMN IF NOT EXISTS schedule_hints JSONB,          -- array of SCHED parsed items
  ADD COLUMN IF NOT EXISTS cost_metrics JSONB;            -- key/value metrics

-- Store metrics on the project
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_metrics JSONB;         -- { floor_area: 210, ... }

-- Anon policies (match existing pattern)
-- (RLS already broadly open for these tables — no new policies needed)
```

---

## File-by-File Implementation Plan

### `server/lib/buildexactClient.mjs`
- Add `getJobEstimateItems(buildexactJobId)`
- Add `updateEstimateItem(buildexactJobId, itemId, updates)`
- Add `acceptEstimate(buildexactJobId, estimateId)`
- Add `updateEstimateStatus(buildexactJobId, estimateId, status)`

### `server/lib/buildexactParser.mjs`
- Add `parseSchedItems(categories)` — takes the parsed categories array, returns `scheduleHints[]`
- Add `parseCostMetrics(categories)` — takes the parsed categories array, returns `{ key: value }` object
- Export both functions

### `server/lib/buildexactIntegrationRoutes.mjs` (new file)
Register in `server/dev-api.mjs` alongside the other route modules.

Routes to add:
- `GET /api/buildexact/job/:buildexactJobId/estimate` — pull estimate from Buildexact, parse it, return `{ estimate, scheduleHints, costMetrics }`
- `POST /api/fee-proposal/:id/accept` — mark proposal accepted + sync to Buildexact

The quote-accept push (Item 2) should be wired directly into the existing quote-accept route in `server/lib/module4Routes.mjs` or `server/dev-api.mjs` — find where `rfqs` status is set to `'accepted'` and add the push there.

The fee-proposal-sent push (Item 3A) should be wired into the existing `/api/fee-proposal/send` route in `server/lib/module5Routes.mjs`.

### `server/lib/scheduleGenerate.mjs`
- Accept an optional `scheduleHints` array parameter
- When generating tasks, check if a hint exists for the matching phase/task name before asking Claude to estimate duration
- If a hint is found, use its `duration_days` directly; log `[schedule] using Buildexact duration for ${taskName}: ${durationDays} days`

### `src/pages/FeeProposalWizard.jsx`
- Add "Pull from Buildexact" button on the Cover tab, conditionally shown when job has `buildexact_job_id`
- Wire it to call `/api/buildexact/job/:id/estimate` then `mergeParsedToProposal()`
- Store `buildexact_estimate_id` and `buildexact_job_id` in proposal state and persist to DB
- Add "Mark as Accepted" button on the Summary or Next Steps tab
- Wire it to `POST /api/fee-proposal/:id/accept`

### `supabase/migrations/014_buildexact_deep_integration.sql`
- The migration SQL above

---

## Error Handling Rules

- All Buildexact API calls are **non-blocking** for status syncs — wrap in `try/catch` and log warnings, never fail the primary user action
- If `buildexact_job_id` is missing, skip the push silently
- If the Buildexact API returns an error (4xx/5xx), log it with context and continue
- The "Pull from Buildexact" button is the only **blocking** Buildexact call (user is waiting for it) — show proper error messages in the UI for this one

---

## Coding Standards (from CLAUDE.md)

- Use `beFetch()` from `buildexactClient.mjs` for all Buildexact API calls — never construct auth headers manually
- All new server routes go in `server/lib/` and are registered via a `register*Routes(app)` function called from `server/dev-api.mjs`
- Frontend fetches use relative `/api/...` paths (no hardcoded ports or hostnames)
- Supabase service role client (`getServiceSupabase()`) on server; anon client (`getSupabase()`) on frontend
- Guard all `getServiceSupabase()` returns for null (may be unconfigured)
- Design tokens in Tailwind — use `primary`, `accent`, `warning`, `surface`, `page`, `ink`, `muted`, `hairline` not raw hex
- `npm run lint` must pass with zero warnings after your changes

# WHS Prefill from project_metrics — Implementation Brief
_For: System Architect agent | Codebase: `/Users/samuelmorris/Desktop/blue-leaf-hub`_

---

## Summary

The WHS Setup page (`/operations/:projectId/whs-setup`) has a questionnaire with Module 0
"Construction Method" that asks about frame type, roof type, retaining walls, basement,
suspended slab, structural steel, demolition, masonry cutting, steep site, bushfire zone,
and pre-1990 building age. These answers drive the WHS risk engine and determine which
SWMS, permits, and inspections are required.

All of these facts are **already registered in the fact registry, already have columns in
`project_metrics`, and the AI extraction pipeline already populates them from architectural
PDFs via the Cost Intelligence module**. The only missing piece is that the WHS prefill
function in `whsEngineRoutes.mjs` does not read from `project_metrics` at all.

This is a **read-only wiring task** — no migration, no extraction prompt change, no new
tables. Just add one DB query and extend the prefill object.

---

## Relevant files

| File | Role |
|---|---|
| `server/lib/whs/whsEngineRoutes.mjs` | **Primary target** — WHS profile GET endpoint, builds `prefill` object |
| `server/lib/whs/whsQuestionnaire.mjs` | Question key names and enum values |
| `server/lib/jobFactRegistry.mjs` | Canonical source of truth for which column holds each fact |
| `server/lib/costIntelligenceRoutes.mjs` | The AI extraction pipeline that populates `project_metrics` |
| `supabase/migrations/032_cost_intelligence_engine.sql` | Original `project_metrics` schema |
| `supabase/migrations/069_knowledge_core.sql` | Added `frame_type`, `has_basement`, `has_structural_steel`, `has_demolition`, `building_age` columns |

---

## Data flow (current state)

```
[Architectural PDFs]
       ↓ (Cost Intelligence AI extraction — costIntelligenceRoutes.mjs)
project_metrics (job_id FK)
  .storeys, .frame_type, .roof_type, .has_suspended_slab,
  .has_retaining_walls, .has_basement, .has_structural_steel,
  .has_demolition, .site_slope, .bal_rating, .building_age

projects table  →  jobs table  →  project_metrics table
(project_id)       (job_id)         (job_id)

WHS prefill currently reads:
  ✅ jobs.project_type  →  m0_project_type
  ✅ jobs.storeys        →  m0_storeys
  ❌ project_metrics.*   (not read at all)
```

---

## What needs to change — one file, `whsEngineRoutes.mjs`

### Step 1 — Fetch `project_metrics` alongside job

The profile GET already fetches `project` then `job`. Add a parallel fetch for `project_metrics`
using `project.job_id` as the FK key. Read the full `whsEngineRoutes.mjs` file before editing.

```javascript
// After the existing job fetch, add:
let metrics = null;
if (project.job_id) {
  ({ data: metrics } = await sb
    .from("project_metrics")
    .select("*")
    .eq("job_id", project.job_id)
    .maybeSingle());
}
```

Or fetch all three in parallel with `Promise.all` if performance matters (the existing
`job` fetch is already sequential — either pattern is acceptable, just stay consistent).

### Step 2 — Add helper functions for mapping

Add these helpers near `mapProjectType` and `mapStoreys` (already in the file):

```javascript
/** Map project_metrics.frame_type → m0_frame_type questionnaire value */
function mapFrameType(raw) {
  const t = String(raw || "").toLowerCase().trim();
  if (t === "timber") return "timber";
  if (t === "steel") return "steel";
  if (t.includes("mixed") || t.includes("combo")) return "mixed";
  return "";
}

/** Map project_metrics.site_slope → yesno for "steep site?" */
function mapSteepSite(slope) {
  return ["steep", "very_steep"].includes(String(slope || "").toLowerCase()) ? "yes" : "";
}

/** Convert a boolean/null metric to yesno string or "" */
function metricBool(v) {
  if (v === true) return "yes";
  if (v === false) return "no";
  return "";            // null/undefined → don't prefill, let user decide
}
```

### Step 3 — Extend the prefill object

The existing prefill object already has `m0_project_type`, `m0_storeys`, and
`site_qr_induction_url`. Extend it with the `project_metrics`-sourced fields:

```javascript
const prefill = {
  // ── existing fields (keep as-is) ──
  project_name:         project.address || "",
  project_address:      project.address || "",
  client_name:          project.client_name || project.portal_client_name || job?.client_name || "",
  project_type:         job?.project_type || project.project_type || "",
  site_supervisor_name: project.supervisor || job?.supervisor || "",
  principal_contractor: "Blue Leaf Building",
  m0_project_type:      mapProjectType(job?.project_type || project.project_type),
  m0_storeys:           mapStoreys(metrics?.storeys ?? job?.storeys ?? project.storeys),
  site_qr_induction_url: `${appUrl}/induct/${projectId}`,

  // ── NEW: from project_metrics (populated by Cost Intelligence AI extraction) ──
  m0_frame_type:        mapFrameType(metrics?.frame_type),
  // NOTE: m0_roof_type is SKIPPED intentionally — the questionnaire asks about
  //   roof STRUCTURE (trusses/conventional/flat/pitched) but project_metrics.roof_type
  //   stores CLADDING type (colorbond/tiled/etc). These are different questions and
  //   cannot be reliably mapped. Leave blank for manual entry.
  m0_retaining_walls:   metricBool(metrics?.has_retaining_walls),
  m0_basement:          metricBool(metrics?.has_basement),
  m0_suspended_slab:    metricBool(metrics?.has_suspended_slab),
  m0_structural_steel:  metricBool(metrics?.has_structural_steel),
  m0_demolition_scope:  metricBool(metrics?.has_demolition),
  m0_steep_site:        mapSteepSite(metrics?.site_slope),
  m0_bushfire_zone:     metrics?.bal_rating ? "yes" : "",
  m0_pre_1990:          (metrics?.building_age && metrics.building_age < 1990) ? "yes" : "",
  // m0_masonry_cutting — no metric available, leave for manual entry
};
```

---

## Questionnaire key ↔ project_metrics column mapping table

| WHS question key | Questionnaire type | project_metrics column | Notes |
|---|---|---|---|
| `m0_project_type` | select | `jobs.project_type` | already wired |
| `m0_storeys` | select | `metrics.storeys` (or `jobs.storeys`) | already wired, prefer metrics |
| `m0_frame_type` | select (timber/steel/mixed) | `metrics.frame_type` | NEW |
| `m0_roof_type` | select (trusses/conventional/flat/pitched) | — | SKIP — cladding vs structure mismatch |
| `m0_retaining_walls` | yesno | `metrics.has_retaining_walls` (boolean) | NEW |
| `m0_basement` | yesno | `metrics.has_basement` (boolean) | NEW |
| `m0_suspended_slab` | yesno | `metrics.has_suspended_slab` (boolean) | NEW |
| `m0_structural_steel` | yesno | `metrics.has_structural_steel` (boolean) | NEW |
| `m0_demolition_scope` | yesno | `metrics.has_demolition` (boolean) | NEW |
| `m0_steep_site` | yesno | `metrics.site_slope` (map steep/very_steep → yes) | NEW |
| `m0_bushfire_zone` | yesno | `metrics.bal_rating` (non-null → yes) | NEW |
| `m0_pre_1990` | yesno | `metrics.building_age` (< 1990 → yes) | NEW |
| `m0_masonry_cutting` | yesno | — | No metric — skip |

---

## `yesno` prefill behaviour — important constraint

The frontend (`WhsEngine.jsx`) applies prefill to empty answer slots only:
```javascript
const blended = { ...prefill, ...(savedAnswers) };
```
So `"yes"` and `"no"` from prefill will only fill fields the user has never saved.
An empty string `""` from `metricBool(null)` leaves the slot untouched — the user
sees a blank yesno and decides themselves. This is the correct behaviour for fields
where the metric is unknown.

---

## Dependency: data must already be in project_metrics

This prefill only works if the Cost Intelligence AI extraction has been run for the job.
That extraction is triggered from the Cost Intelligence module when architectural PDFs
are uploaded. If it hasn't been run, all the new prefill keys will return `""` and the
questionnaire will show blank — correct fallback behaviour, no errors.

You do **not** need to backfill `project_metrics` or run any extraction as part of this
ticket. The prefill silently degrades for jobs where metrics are missing.

---

## What NOT to do

- **Do not modify `whsQuestionnaire.mjs`** — question keys and options are correct as-is.
- **Do not add a migration** — all required columns already exist from migrations 032 + 069.
- **Do not change the extraction prompt** — Cost Intelligence extraction is a separate system.
- **Do not promote any new fields in PROMOTED_FIELDS** — these are questionnaire `answers`
  JSONB fields, not direct `whs_site_profiles` columns.
- **Do not modify `WhsEngine.jsx`** — the frontend already handles prefill correctly.
- **Do not attempt to map `m0_roof_type`** — the column semantics don't match.

---

## Verification

After the change, hit the profile endpoint for a project that has had Cost Intelligence
extraction run (check `project_metrics` table has non-null values):

```bash
# Get an auth token from the running app, then:
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8787/api/whs/projects/6bb6fcbc-3da1-4e18-80ee-8cbcb97fdef4/profile \
  | jq '.prefill | {m0_frame_type, m0_retaining_walls, m0_basement, m0_suspended_slab}'
```

Expected for a project with metrics: the new keys appear with non-empty values.
For a project with no metrics row: all new keys return `""`.

Also open the WHS Setup page in the browser. Module 0 "Construction Method" fields that
have metrics data should show pre-selected values with the blue "pre-filled from project
data" banner at the top.

---

## Commit message template

```
feat(whs): prefill Module 0 construction facts from project_metrics

Wire project_metrics → WHS Setup prefill for frame_type, retaining_walls,
basement, suspended_slab, structural_steel, demolition, steep site, bushfire
zone, and pre-1990 flag. Data is already extracted from architectural PDFs by
the Cost Intelligence AI pipeline and stored in project_metrics. This change
is read-only — no migration, no extraction changes. Fields silently degrade
to blank when project_metrics has no row for the job.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

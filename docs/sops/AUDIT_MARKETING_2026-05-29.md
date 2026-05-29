# Marketing Module Audit — 2026-05-29

**Auditor:** Troubleshoot Agent (Claude)
**Method:** Full static code analysis (all 15 SOPs + all relevant code files) + live browser observation (dev server at localhost:5173)
**Audit scope:** Module 18 (Marketing Agent / Content Studio) — 7 SOPs; Module 19 (Marketing Intelligence) — 8 SOPs

---

## Summary

| Metric | Count |
|--------|-------|
| SOPs audited | 15 |
| Test cases run | 63 (across all Section 14s) |
| PASS | 18 |
| FAIL | 20 |
| SKIP | 25 |
| Critical bugs (blocks core workflow) | 3 |
| Medium bugs (degrades experience, workaround exists) | 6 |
| Low bugs (minor/cosmetic/edge case) | 4 |
| API standards violations | 5 |

---

## CRITICAL BUGS

### BUG-001 — Social publish fails HTTP 400: camelCase/snake_case mismatch

**SOP:** 19-02 (Record a Social Media Publish) TC-03, TC-04; also blocks 18-04 TC-04
**Test case:** 19-02 TC-03
**Expected:** Clicking "Mark as Published" saves a `social_post_publishes` row, sets content status to `published`, enables performance tracking
**Actual:** HTTP 400 — `{ ok: false, error: "content_item_id required" }` — publish never saves, status stays `approved`
**Steps to reproduce:**
1. Log in as Admin
2. Go to Library → open an approved content item
3. Click Mark as Published
4. Fill in: Platform = Instagram, Post URL = any Instagram URL, Caption = any text
5. Click Save
6. Result: HTTP 400 error, form shows error, no DB record created

**Root cause:**
- `src/components/marketing/ContentLibrary.jsx` (~line 342) posts: `{ contentItemId: item.id, platform, captionUsed: ... }` (camelCase)
- `server/lib/marketingIntelligenceRoutes.mjs` (~line 265) destructures: `const { content_item_id, platform, platform_post_url, caption_used } = req.body` (snake_case)
- `content_item_id` is undefined → server immediately returns 400

**Impact:** The entire "Mark as Published" workflow is broken. No content item can ever transition from `approved` to `published`. Blocks: social post performance tracking, Meta sync, and every test case in 19-02 TC-03 onward. All of 19-03, 19-05 are also blocked.

---

### BUG-002 — Intelligence dashboard renders all sections empty: key name mismatch between API and component

**SOP:** 19-01 (Intelligence Dashboard) TC-01, TC-05
**Test case:** 19-01 TC-01
**Expected:** Marketing → Intelligence tab shows all 5 sections with data or graceful empty states
**Actual:** All 5 sections render empty/undefined. "Last refreshed: unknown" always shows. No data appears.
**Steps to reproduce:**
1. Log in as Admin
2. Navigate to Marketing → Intelligence
3. Dashboard loads (no spinner error), but all KPIs show "—", all panels show empty states
4. Open Network tab — `GET /api/intelligence/dashboard` returns 200 with valid JSON payload

**Root cause — two compounded issues:**

*Issue 1 — wrong data nesting:*
`apiFetch("/api/intelligence/dashboard")` returns `data = { ok: true, dashboard: { this_month: {...}, working: [...], ... } }`. The component sets `setData(d)` where `d` is the full response. Then reads `data?.thisMonth` (top-level property) — but the actual path is `data?.dashboard?.this_month`.

*Issue 2 — key name mismatch even if nesting were fixed:*

| API sends | Component reads | Match? |
|-----------|----------------|--------|
| `dashboard.this_month.enquiries` | `data?.thisMonth?.enquiries` | ✗ |
| `dashboard.this_month.qualified` | `data?.thisMonth?.qualifiedLeads` | ✗ (wrong key name) |
| `dashboard.working` | `data?.whatsWorking` | ✗ |
| `dashboard.not_working` | `data?.whatsNot` | ✗ |
| `dashboard.opportunities` | `data?.googleOpportunity` | ✗ |
| `dashboard.follow_up` | `data?.followUpNow` | ✗ |
| `dashboard.create_next` | `data?.createNext` | ✗ |
| *(not returned)* | `data?.generatedAt` | ✗ — always "unknown" |

**Impact:** The Marketing Intelligence module is completely non-functional. All 5 dashboard sections (This Month KPIs, What's Working, Google Opportunity, Follow Up Now, Create Next) are broken. This is the core value proposition of the Intelligence tab.

---

### BUG-003 — Content performance endpoint queries non-existent DB columns

**SOP:** 19-03 (View Content Performance) — all 6 test cases blocked
**Test case:** 19-03 TC-01
**Expected:** `GET /api/intelligence/content-performance` returns ranked content items
**Actual:** Supabase returns a query error because the SELECT references columns that don't exist
**Steps to reproduce:**
1. Log in as Admin
2. In Intelligence dashboard (once BUG-002 is fixed), click "See all content performance →"
3. Network request to `/api/intelligence/content-performance` returns 500

**Root cause:**
`marketingIntelligenceRoutes.mjs` (~line 718) selects:
```
"id, title, mode, channel, content_pillar, attributed_enquiries, ..., engagement_rate, published_at"
```
Checking migrations 046 and 062 against `marketing_content_items`:
- `mode` — **column does not exist** in any migration. The content mode (educational/story/behind_scenes) is passed at generation time but never stored.
- `content_pillar` — **column does not exist**. The actual column name is `pillar`.
- `engagement_rate` — **column does not exist** on `marketing_content_items`. This column exists on `social_post_snapshots` and `ga4_snapshots` only.

**Impact:** Content Performance view can never load. The "what content is working" analysis is inaccessible.

---

## MEDIUM BUGS

### BUG-004 — "Lists" tab is undocumented: all users see 7 tabs (admin) or 5 tabs (staff), not the 5 described in SOP

**SOP:** 18-01 (Content Studio Overview) TC-01
**Expected (per SOP):** Admin sees 5 tabs: Create, Library, Campaigns, Media, Music Library. Staff sees 4.
**Actual:**
- Admin sees **7** tabs: Create, Library, Campaigns, Media, **Lists**, **Intelligence**, Music Library
- Staff sees **5** tabs: Create, Library, Campaigns, Media, **Lists** (no Intelligence, no Music Library)

`Marketing.jsx` TABS array contains a `Lists` tab (renders `MailingLists` component) with no `adminOnly` flag — visible to all users. The `Intelligence` tab is `adminOnly: true` and correctly filtered. Neither tab is mentioned in SOP 18-01.

**Impact:** New employees reading SOP 18-01 see the wrong tab count and layout. A "Lists" tab with no SOP coverage creates a support gap. SOP accuracy issue requiring update.

---

### BUG-005 — Campaign "generate content" opens Create tab with no campaign_id pre-selected

**SOP:** 18-05 (Campaigns) TC-03 FAIL
**Expected:** Clicking generate/create content from within a campaign opens Create tab with the campaign pre-selected, so generated content auto-links to the campaign on save
**Actual:** Create tab opens at `/marketing` (no campaign context). User must manually select the campaign from the dropdown.
**Steps to reproduce:**
1. Create a campaign
2. Open the campaign detail
3. Click any "generate content" or "create content" button
4. Create tab opens — Campaign dropdown shows no selection

**Impact:** Every piece of content generated from Campaigns tab must be manually re-linked to the campaign in the Library. Campaigns content mix charts will always under-count.

---

### BUG-006 — No UI validation error when Topic is blank; Generate button appears to do nothing

**SOP:** 18-02 (Generate Content) TC-03 FAIL
**Expected:** Clicking Generate with blank Topic shows a validation error on the Topic field before any API call is made
**Actual:** API correctly returns `{ ok: false, error: "topic required" }` but the UI shows no error message. The button appears unresponsive.
**Steps to reproduce:**
1. Go to Marketing → Create
2. Select any Channel and Pillar — leave Topic blank
3. Click Generate Content
4. No error visible — no content generates

**Impact:** Users think the generate button is broken rather than understanding they missed a required field.

---

### BUG-007 — Five key banned phrases missing from automated review: "luxurious / stunning / bespoke / curated / elevated"

**SOP:** 18-02 TC-04 PARTIAL, 18-04 NOTE
**Expected:** `review_scores.brand_voice` flags content containing any of the SOP-listed banned words
**Actual:** `BANNED_PHRASES` in `server/lib/marketingAgent.mjs` (line 163) does NOT include: luxurious, stunning, bespoke, curated, elevated.

Current BANNED_PHRASES covers: "quality" (generic), "dream home", "stress-free", "trusted builder", "passion for building", "limited spots", "book now", "don't miss", "At Blue Leaf Building, we".

Generated content containing "bespoke detailing" → `review_scores.brand_voice.pass = true` — false pass.

**Confirmed in live test:** Generated a Website Copy/Behind the Scenes piece. Output included "bespoke detailing in the wet areas." Review score passed brand_voice. Banned phrase undetected.

**Impact:** The automated review checker gives false confidence to approvers. Content with these phrases will pass the automated gate and reach approval review without any flag.

---

### BUG-008 — Failed media analysis shows raw error string, not user-facing message

**SOP:** 18-06 TC-04 FAIL
**Expected:** When photo analysis fails, UI shows a friendly message: e.g. "Analysis failed — try re-uploading or use a clearer photo"
**Actual:** The raw error message or "check server logs" appears in the analysis state area — developer-facing language
**Impact:** Employees don't know how to recover. They may try to publish the photo anyway without analysis context, producing generic AI output.

---

## LOW BUGS / COSMETIC

### BUG-009 — Campaign Goal field has no required validation; saves with goal = null

**SOP:** 18-05 TC-02 FAIL
**Expected:** Cannot save a campaign without selecting a Goal
**Actual:** Campaign saves with `goal = null` silently
**Impact:** Data quality — orphaned campaigns with no goal undermine content mix targeting.

---

### BUG-010 — 5000-character topic input accepted; AI refusal text displays in content area

**SOP:** 18-02 TC-05 FAIL
**Expected:** Topic field rejects or warns on very long inputs; no raw AI error text shown to users
**Actual:** No character limit enforced. Extreme length inputs may cause the AI to return a refusal message (e.g. "I cannot generate content for this request"), which is then displayed verbatim in the content streaming area.
**Impact:** Cosmetic/edge case — doesn't affect normal use but produces confusing output.

---

### BUG-011 — Double-click Save to Library creates duplicate content_items rows

**Adversarial test:** Save to Library clicked twice rapidly
**Finding:** `POST /api/marketing/content` has no idempotency guard. Two rapid clicks create two `marketing_content_items` rows with identical content, different UUIDs.
**Impact:** Library fills with duplicates over time. Users who multi-click impatiently (mobile or slow connection) create ghost items.

---

### BUG-012 — Intelligence dashboard "Last refreshed: unknown" always

**SOP:** 19-01 TC-05
**Expected:** "Last refreshed: [date/time]" shows when the dashboard data was last computed
**Actual:** Always "unknown" — the API response never includes a `generatedAt` field, and `data?.generatedAt` is always undefined
**Root cause:** Compound with BUG-002 (nesting). Even if nesting were fixed, the API payload doesn't include `generatedAt`.
**Impact:** Cosmetic on its own. Users can't tell if data is stale.

---

## API STANDARDS VIOLATIONS

### VIOLATION-001 — `/api/marketing/generate/stream` missing `ok: false` in error paths

**File:** `server/lib/marketingRoutes.mjs`, lines 249–250
**Rule violated:** CLAUDE.md — "Never `res.json({ error: msg })` without `ok: false`"
**Current code:**
```js
if (!mode) return res.status(400).json({ error: "mode required" });
if (!_apiKey) return res.status(503).json({ error: "AI not configured" });
```
**Required change:**
```js
if (!mode) return res.status(400).json({ ok: false, error: "mode required" });
if (!_apiKey) return res.status(503).json({ ok: false, error: "AI not configured" });
```
**Also at:** lines 305–310 (catch block in same endpoint)

---

### VIOLATION-002 — `/api/marketing/generate/all-save` missing `ok: false` in all error paths

**File:** `server/lib/marketingRoutes.mjs`, lines 319–349
**Rule violated:** Same as V001
**Current code:**
```js
if (!sb)          return res.status(503).json({ error: "DB not configured" });
if (!items.length) return res.status(400).json({ error: "No items to save" });
// ...
if (error) return res.status(500).json({ error: error.message });
```
**Required change:** All three need `ok: false` added.

---

### VIOLATION-003 — `marketingRoutes.mjs` returns raw snake_case DB data without `rowToCamel`/`rowsToCamel`

**File:** `server/lib/marketingRoutes.mjs` — all CRUD endpoints
**Rule violated:** CLAUDE.md — "Server converts with `rowToCamel(row)` / `rowsToCamel(rows)` before sending. Frontend reads camelCase."
**Affected endpoints:**
- `POST /api/marketing/content` (line ~403): `return res.json({ ok: true, item: data })`
- `GET /api/marketing/content` (line ~430): `return res.json({ ok: true, items: data || [] })`
- `GET /api/marketing/content/:id` (line ~442): `return res.json({ ok: true, item: data })`
- `PUT /api/marketing/content/:id` (line ~468): `return res.json({ ok: true, item: data })`
- `POST /api/marketing/campaigns` (line ~501): `return res.json({ ok: true, campaign: data })`
- All media asset endpoints — raw DB objects returned

**Note:** `marketingIntelligenceRoutes.mjs` correctly uses `rowToCamel`/`rowsToCamel` throughout. The violation is specific to `marketingRoutes.mjs`.

---

### VIOLATION-004 — Raw Supabase error strings reach the browser in `marketingRoutes.mjs`

**File:** `server/lib/marketingRoutes.mjs`, lines ~402, ~429, ~441, ~467, ~501, etc.
**Rule violated:** CLAUDE.md — "Raw Postgres strings must never reach the browser. Use `translateDbError(error)`."
**Current code:**
```js
if (error) return res.status(400).json({ ok: false, error: error.message });
```
**Required change:**
```js
import { translateDbError } from "./apiResponse.mjs";
// ...
if (error) return res.status(400).json({ ok: false, error: translateDbError(error) });
```

---

### VIOLATION-005 — Stream endpoint does not import or use `ok()/err()` from `apiResponse.mjs` at all

**File:** `server/lib/marketingRoutes.mjs`, lines 244–312 (stream endpoint)
**Rule violated:** CLAUDE.md — "All routes: use `ok(res, {...})` / `err(res, N, msg)` from apiResponse.mjs"
**Finding:** `marketingRoutes.mjs` does not import `ok`, `err`, `rowToCamel`, or `rowsToCamel` from `apiResponse.mjs` anywhere in the file. All responses use direct `res.json(...)` calls. This is a file-level omission.

---

## SKIPPED TESTS

### Blocked by BUG-001 (publish broken):
- 19-02 TC-03 — Post ID extraction from URL
- 19-02 TC-04 — Nightly Meta sync creates snapshot records
- 19-02 TC-05 — Duplicate snapshot prevention
- 19-02 TC-06 — Performance stats written back to content item

### Blocked by BUG-002 (dashboard broken):
- 19-01 TC-02 — This Month KPIs match Sales data
- 19-01 TC-03 — What's Working shows attributed content
- 19-01 TC-06 — Create Next links to Create tab

### Blocked by BUG-003 (content performance columns missing):
- All 19-03 test cases (TC-01 through TC-06)

### Blocked by missing infrastructure (GSC sync, attribution capture):
- All 19-04 test cases (TC-01–TC-06) — `GOOGLE_SEARCH_CONSOLE_SITE_URL` not configured
- 19-01 TC-04 — Google Opportunity section
- All 19-05 test cases (TC-01–TC-06) — requires live website attribution events

### Blocked by no inventory data:
- All 19-06 test cases (TC-01–TC-06) — no `website_pages` rows exist
- All 19-08 test cases (TC-01–TC-06) — same
- All 19-07 test cases (TC-01–TC-07) — no `website_questions` rows; nightly scan not triggered

### Test infrastructure unavailable:
- 18-06 TC-02 — Video upload thumbnail (no test MP4 in session)
- 18-06 TC-03 — DJI D-Log M detection (no DJI footage)
- 18-06 TC-05 — Video export (requires video asset)
- 18-07 TC-02–TC-05 — Music Library toggle/export/delete (requires staff test account + video asset)
- 18-04 TC-02 — Staff cannot approve (requires staff-role login session)

---

## ADDITIONAL FINDINGS

### AF-001 — Double-click Save creates duplicate content items

**Test:** Clicked "Save to Library" twice rapidly after generation
**Finding:** `POST /api/marketing/content` has no idempotency guard. Two rows inserted with identical content, different UUIDs. Button does not disable during in-flight request.

---

### AF-002 — Form state is silently wiped on tab switch — no "unsaved changes" warning

**Test:** Filled in all Create tab fields, generated content, clicked Library tab, returned to Create
**Finding:** All state (topic, channel, pillar, mode, generated content) is gone. No warning is shown. On mobile this is particularly easy to trigger accidentally.

---

### AF-003 — Banned phrase confirmed in live AI output but automated checker gives false PASS

**Test:** Generated 3 pieces of content with topic "Thermal mass decisions at design stage — Stirling renovation"
**Findings:**
- Instagram/Educate: PASS — no banned phrases, hook present, human consequence translation present
- Facebook/Authority: PARTIAL — "the beautiful result" appeared mid-sentence (not caught by hook checker pattern which tests opening only)
- Website Copy/Behind the Scenes: FAIL — "bespoke detailing in the wet areas" in body. `review_scores.brand_voice.pass = true`. False pass.

---

### AF-004 — `GET /api/marketing/music` (active tracks) accessible to all authenticated users, not just admin

**Finding:** `POST/PATCH/DELETE /api/marketing/music` endpoints correctly require `requireRole("admin")`. However `GET /api/marketing/music` (line 1313 in marketingRoutes.mjs) only requires `requireAuth` — any Staff user can retrieve the full list of active music tracks via direct API call even though the UI tab is hidden.
**Severity:** Low — track metadata exposure is minimal security risk.

---

### AF-005 — Re-approving content overwrites `approved_at` timestamp silently

**Test:** Approved an item, moved it back to in_review, approved again
**Finding:** `approved_at` and `reviewed_by` are silently overwritten with the new values. Original approval timestamp lost. No audit trail preserved.
**Severity:** Low — no functional breakage, but audit trail gap.

---

### AF-006 — Performance: API response times

- `GET /api/marketing/content` (Library): ~400ms ✅ PASS (under 2s threshold)
- `GET /api/intelligence/dashboard`: ~800ms at API level ✅ PASS at API; ❌ FAIL at UI (BUG-002)
- Content generation stream start: ~3–4s ✅ PASS (under 5s threshold)

---

## SOP ACCURACY ISSUES

### SAI-001 — SOP 18-01 says "five tabs" but implementation has 7 (admin) or 5 non-matching tabs (staff)

SOP 18-01 section 5 lists: Create, Library, Campaigns, Media, Music Library (admin only). Actual: 7 tabs including undocumented `Lists` and `Intelligence`. SOP needs updating to reflect the actual tab layout.

### SAI-002 — SOP 18-02 says "no hard limit" on Topic — should specify ~500 char soft limit

Section 12 says "no hard limit but aim for 2–4 sentences." Adversarial test confirms 5000-char inputs cause AI refusal output. SOP should add a recommended limit and the UI should enforce a character counter.

### SAI-003 — SOP 18-04 brand voice checklist includes luxurious/stunning etc. but automated review does not check them

Section 7 lists manual checklist items including these phrases. The `review_scores.brand_voice` automated check does NOT flag them. The SOP should explicitly note this gap; ideally BUG-007 is fixed first.

### SAI-004 — SOP 19-03 content table references `mode` and `content_pillar` — neither column exists in DB

The content performance table in SOP 19-03 describes a "content mode" sub-field. No `mode` or `content_pillar` column exists in `marketing_content_items`. The column is `pillar`. Fix BUG-003 and update the SOP to reflect the correct column name.

### SAI-005 — SOP 19-01 automation note says dashboard data is "pre-computed nightly" but implementation queries live

Section 11 says "Dashboard data is pre-computed nightly — not live-queried on page load". The actual `GET /api/intelligence/dashboard` runs 5 parallel live DB queries on every load. There is no nightly caching layer. The SOP is aspirationally accurate but describes a different architecture to what's built. Update SOP to reflect live-query approach (which is fine for current data volumes).

---

## PRIORITY FIX ORDER

To unblock the most test cases with the least effort:

1. **BUG-001 (30 min)** — Fix `ContentLibrary.jsx` publish payload to snake_case: `contentItemId → content_item_id`, `captionUsed → caption_used`, `platformPostUrl → platform_post_url`. Unblocks entire publish workflow + 4 skipped TC-03–06 in 19-02.

2. **BUG-002 (1 hour)** — Fix `MarketingIntelligence.jsx` to read `data.dashboard.this_month` etc.; map API keys correctly (`qualified → qualifiedLeads`, `working → whatsWorking`, `not_working → whatsNot`, `opportunities → googleOpportunity`, `follow_up → followUpNow`, `create_next → createNext`). Add `generated_at` to API response. Unblocks entire Intelligence dashboard.

3. **BUG-003 (1 hour)** — Fix content-performance SELECT: replace `mode` with nothing (drop from response or add migration column `content_mode`), replace `content_pillar` with `pillar`, remove `engagement_rate` (doesn't exist on this table). Unblocks 19-03 content performance view.

4. **BUG-007 (5 min)** — Add to BANNED_PHRASES in `marketingAgent.mjs`: luxurious, stunning, bespoke, curated, elevated. Unblocks 18-02 TC-04 and genuine brand safety.

5. **VIOLATION-003 (2 hours)** — Add `rowsToCamel()`/`rowToCamel()` to all list/detail endpoints in `marketingRoutes.mjs`. Required for consistent API contract.

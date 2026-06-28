# Marketing Run C1 — Result

**Doc ID:** MARKETING-RUN-C1-RESULT
**Date:** 2026-06-28
**Author:** Claude (Run C1 implementation)
**Branch:** `marketing-run-a` (isolated worktree `blh-marketing.nosync`)
**Scope:** Run C1 = content package persistence + Approval Queue foundation. Build-only; no migrations applied; no production; static checks only. (Run C2 Calendar / manual publish NOT started.)

---

## 1. Status

| Item | Result |
|---|---|
| Run C1 completed | **Yes (code-complete; lint + build + node --check green)** — runtime smokes deferred (no safe staging) |
| Code changed | **Yes** |
| Tests changed | **No** |
| Docs changed | **Yes** |
| Migration file created | **No** — uses Run A's `122` packages table + content_items columns (`package_id`, `operational_labels`, `risk_level`, `generation_metadata`) |
| Migration applied | **No** |
| Package persistence implemented | **Yes** |
| Approval Queue implemented | **Yes** (foundation) |
| Legacy Studio preserved | **Yes** — `/marketing/studio/legacy` + `ContentGenerator` untouched; `POST /api/marketing/content` untouched |
| Run A routes preserved | **Yes** |
| Run B Creator preserved | **Yes** — `/marketing/studio` still the media-first Creator (now with "Send package") |

## 2. Files changed (6)

**New (2):** `server/lib/marketingPackageRoutes.mjs` (package CRUD + approval), `src/components/marketing/ApprovalQueue.jsx`

**Modified (4):** `server/dev-api.mjs` (register package routes), `src/components/marketing/MarketingRouter.jsx` (`/marketing/approval` route), `src/components/AppShell.jsx` (Approval Queue nav), `src/components/marketing/ContentCreator.jsx` ("Send package to Approval Queue" action)

## 3. Routes changed

| Route | Change |
|---|---|
| `/marketing/approval` | **New** — Approval Queue (admin-gated, under `/marketing/*`) |
| `/marketing/studio` | Unchanged route; Creator gains a package-save action |
| `/marketing/studio/legacy`, all Run A routes | **Unchanged** |

## 4. APIs changed (new; all under the existing `/api/marketing` admin gate)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/marketing/packages` | Persist an already-generated draft set as a package + child content items (no AI, no posting) |
| GET | `/api/marketing/packages?status=` | List packages (+ child items) — Approval Queue source |
| GET | `/api/marketing/packages/:id` | Package detail |
| PATCH | `/api/marketing/packages/:id/approve` | Approval decision: `approve` / `request_changes` / `reject` (status only — no publish) |

**Legacy `POST /api/marketing/content` was NOT edited** (see §7 design note).

## 5. Package persistence

- `POST /api/marketing/packages` inserts a `marketing_content_packages` row (`angle_payload`,
  `source_asset_ids[]`, `audience[]`, `recommended_platforms[]`, `review_summary`, `status='in_review'`)
  and child `marketing_content_items` linked via `package_id`, each carrying `operational_labels`,
  `risk_level`, `generation_metadata`, and `review_scores`.
- `ContentCreator` computes per-draft Josh labels + risk (`deriveJoshLabels`/`deriveRiskLevel`) and an
  aggregate `reviewSummary` (max risk + union of labels), excludes demo drafts, and POSTs the package,
  then links to the Approval Queue.
- Approval Queue lists `status=in_review` packages with per-platform previews + labels + risk, and
  approve / request-changes / reject actions that PATCH the package (cascading status to child items).
  Safe **demo package fallback** when the API is unreachable.

## 6. Verification

| Check | Result |
|---|---|
| `npm run lint` | **Pass** (0 errors / 0 warnings) |
| `npm run build` | **Pass** (pre-existing main-bundle size warning only) |
| `node --check server/lib/marketingPackageRoutes.mjs` + `server/dev-api.mjs` | **Pass** |
| Runtime checks run | **No** |

**Runtime checks deferred — reason:** no safe staging/sandbox (no `.env.staging`/`.env.sandbox`; the
worktree has no `.env`). The package endpoints require migration 122 applied + a DB; without them they
return a translated DB error and the Approval Queue shows its demo fallback. No production touched, no
migration applied.

## 7. Design note — why legacy `/content` was not edited

The brief allows updating the save API "only as needed," but adding the new columns
(`generation_metadata`, etc.) to the legacy `POST /api/marketing/content` insert would **break that
flow on any DB without migration 122** (insert of a non-existent column fails). Since 122 is not
applied in any reachable environment, that would have tripped the "legacy save flow breaks" stop
condition. Instead, the **new package API** persists the full Run B metadata, so those fields are no
longer silently dropped — via the package path — while the legacy endpoint stays byte-for-byte intact
(zero regression risk). Per-draft "Save to Library" still uses the unchanged legacy endpoint (core fields).

## 8. Defects found
None from static checks. Open verification gap: runtime UAT on staging (create package → appears in
Approval Queue → approve/request/reject updates status; legacy + Run A/B routes still work).

## 9. Unresolved decisions / follow-ups
- **`generation_metadata` on the legacy `/content` endpoint** — intentionally not wired (pre-122 break
  risk). Revisit once 122 is reliably applied, or migrate per-draft save onto the package API.
- **AI package-generate** (`POST /api/marketing/packages/generate` orchestrating live `/generate`) — deferred until an AI service exists; Run C1 persists already-generated drafts only.
- **Approval policy / Sam gates** (per-template `approval_mode`, client-name detection) — not in C1; future.
- **Calendar + manual publish (Run C2)** — not started, per scope.
- `ContentCreatorShell.jsx` remains an orphaned file (left in place).

## 10. Recommendation for Run C2 readiness
Run C1 foundation (package persistence + Approval Queue) is in place, standards-clean, and isolated.
**Run C2 (Calendar + manual publish logging) can be planned after:** (1) staging provisioned + 122
applied, (2) Run C1 runtime smokes pass there (package create → queue → approve), and (3) Sam signs
off this result. Run C2 then adds the cross-campaign Calendar (assign approved packages/items to
`campaign_schedule_slots`) and manual `social_post_publishes` logging — no auto-posting.

---

Next safe action: Sam reviews `MARKETING_RUN_C1_RESULT.md` and decides whether Run C2 Calendar/manual publish can proceed.

Blocked by: Production env requirement, migration apply requirement, destructive schema requirement, broken legacy studio, failed lint/build, wrong branch, dirty unrelated files, or scope pulling in Calendar/publishing. (None encountered; runtime smokes pending staging.)

Code changed: yes
Tests changed: no
Docs changed: yes

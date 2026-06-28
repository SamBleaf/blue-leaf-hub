# Marketing Run B — Result

**Doc ID:** MARKETING-RUN-B-RESULT
**Date:** 2026-06-28
**Author:** Claude (Run B implementation)
**Branch:** `marketing-run-a` (isolated worktree `blh-marketing.nosync`)
**Scope:** Run B = media-first Content Studio (first real Creator workflow). Build-only; no migrations applied; no production; static checks only.

---

## 1. Status

| Item | Result |
|---|---|
| Run B completed | **Yes (code-complete; lint + build green)** — runtime smokes deferred (no safe staging, §runtime) |
| Code changed | **Yes** |
| Tests changed | **No** |
| Docs changed | **Yes** |
| Migration file created | **No** — Run A's `122` already added the needed columns (`generation_metadata`, `operational_labels`, `risk_level`, `suggested_uses`); no new schema required for Run B |
| Migration applied | **No** (and none created) |
| Legacy Studio preserved | **Yes** — `/marketing/studio/legacy` + `ContentGenerator` unchanged; generate/stream/save intact |
| `/marketing/studio` now media-first | **Yes** — placeholder shell replaced by `ContentCreator` |
| `?asset_id=` path preserved | **Yes** — `ContentCreator` reads `?asset_id=` (Run A contract); `LegacyStudio` `?asset_id=` unchanged |
| Mock/demo fallbacks added | **Yes** — demo asset, demo angles, demo drafts; all clearly labelled DEMO |

## 2. Files changed (9)

**New (7):**
- `src/components/marketing/ContentCreator.jsx` — three-column media-first Creator (asset · decisions · package)
- `src/components/marketing/creatorData.js` — audience/platform vocab, angle derivation, demo data, Josh-label/risk helpers
- `src/components/marketing/AngleCards.jsx`, `ReviewSummary.jsx`, `JoshLabelBadge.jsx`, `WhyThisPanel.jsx`, `MediaPickerModal.jsx`

**Modified (1):** `src/components/marketing/MarketingRouter.jsx` (`/marketing/studio` → `ContentCreator`)

**Docs (1):** `docs/planning/MARKETING_RUN_B_RESULT.md`

**Orphaned (left in place, harmless):** `ContentCreatorShell.jsx` — no longer imported; retained (no destructive cleanup). Can be deleted in a later run.

## 3. Routes changed

| Route | Change |
|---|---|
| `/marketing/studio` | Now renders **`ContentCreator`** (was `ContentCreatorShell` placeholder) |
| `/marketing/studio/legacy` | **Unchanged** — Legacy Studio + `?asset_id=` rehydration intact |
| All other Run A routes | Unchanged |

## 4. APIs changed

**None.** Run B reuses existing endpoints only:
- `GET /api/marketing/media/:id` (resolve `?asset_id=`), `GET /api/marketing/media` (vault picker)
- `POST /api/marketing/generate` (per-platform draft), `POST /api/marketing/content` (save draft)

No new/edited server routes; no `dev-api.mjs` change. Angle suggestions are **derived client-side
from the asset's existing `analysis.content_opportunities`** — no new AI endpoint, no live AI call
required to show the asset→angles flow. (A future `ANGLE_GENERATION` AI endpoint is a Run C item.)

## 5. What was built (Run B scope)

- **Media-first Creator** at `/marketing/studio`: select media (deep link `?asset_id=`, vault picker, or demo), see analysis (`analysis` + `analysis_status`), pick an angle, choose audience + platforms, generate a small IG+FB(+opt) package, review per draft.
- **Analysis display** using existing `analysis`/`analysis_status` fields (summary, build stage, visible facts).
- **Suggested angle UI** (`AngleCards`) derived from `analysis.content_opportunities` (schema already supports it; no new fields needed).
- **Review Summary** (`ReviewSummary`): Josh labels + risk first; numeric `ReviewPanel` scores under "See quality details".
- **Draft content package UI** (right column): per-platform editable drafts, save to Library — **isolated, no live posting**.
- **Idea-first secondary path**: topic → generate → **Needs photo** nudge (no media required to draft).
- **Safe demo/mock fallbacks** throughout for the no-staging/no-AI environment.

## 6. Verification

| Check | Result |
|---|---|
| `npm run lint` | **Pass** (0 errors / 0 warnings) |
| `npm run build` | **Pass** (pre-existing main-bundle size warning only) |
| `node --check` | **N/A** — Run B changed no server `.mjs` files |
| Runtime checks run | **No** |

**Runtime checks deferred — reason:** no safe staging/sandbox exists (no `.env.staging`/`.env.sandbox`;
the worktree has no `.env`). Booting would require production credentials and live AI/DB — barred by
Sam's hard rule. Generation needs the AI service; the UI falls back to clearly-labelled demo drafts
when it is unavailable, so the flow renders without live integrations.

## 7. Defects found
None from static checks. Open verification gap: runtime UAT on staging (select media → analyse →
angle → IG/FB drafts → labels/why → save; idea-first → Needs photo; legacy still generates/saves).

## 8. Unresolved decisions / follow-ups (Run C candidates)
- **AI angle generation** (`ANGLE_GENERATION` prompt + endpoint) — currently angles are derived from
  existing analysis; richer AI angles need a live AI service (staging).
- **`generation_metadata` persistence** — `ContentCreator` sends it on save, but the legacy
  `POST /api/marketing/content` handler only persists its known columns; wiring it through is a Run C edit.
- **`marketing_content_packages` entity** — Run B drafts are saved as individual content items (no
  package row yet); the package entity + Approval Queue are Run C (out of Run B scope, not built).
- **Column-component split** (`MediaColumn`/`DecisionColumn`/`PackageColumn`) — consolidated into
  `ContentCreator` for Run B; can be split later.
- **Delete orphaned `ContentCreatorShell.jsx`** when convenient.

## 9. Recommendation for Run C readiness
Run B foundation is in place, standards-clean, and isolated. **Run C (full content packages +
Approval Queue + package approval, then Calendar/manual publish) can be planned after:** (1) a safe
staging/sandbox is provisioned and migration 122 applied, (2) Run B runtime smokes pass there
(especially real AI generation + save), and (3) Sam signs off this Run B result. Run C should also
wire `generation_metadata`/`operational_labels` persistence and introduce the `marketing_content_packages` workflow.

---

Next safe action: Sam reviews `MARKETING_RUN_B_RESULT.md` and decides whether Run C can proceed.

Blocked by: Production env requirement, migration apply requirement, broken legacy studio, failed lint/build, wrong branch, dirty unrelated files, or scope pulling in Run C. (None encountered; runtime smokes pending staging.)

Code changed: yes
Tests changed: no
Docs changed: yes

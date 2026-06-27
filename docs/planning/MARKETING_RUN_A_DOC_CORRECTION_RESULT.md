# Marketing Run A — Doc Correction Pass Result

> **Superseded for implementation gating by:** [MARKETING_RUN_A_FREEZE_PARKING_RESULT.md](./MARKETING_RUN_A_FREEZE_PARKING_RESULT.md) and [SAM-MKT-001](../qa/SAM_DECISION_LOG.md). Run A is **parked** during Go-Live P0/P1 hardening. Planning corrections below remain valid **when Run A reopens**.

**Plan ID:** MARKETING-RUN-A-DOC-CORRECTION-PASS-01  
**Date:** 2026-06-22  
**Author:** Cursor (planning-doc corrector / code-audit reconciler)  
**Mode:** Docs only — no product code, schema, routes, migrations, commits, or deploys

---

## 1. Docs updated

| Document | Changes |
|---|---|
| [MARKETING_RUN_A_B_HANDOFF_READINESS.md](./MARKETING_RUN_A_B_HANDOFF_READINESS.md) | Security premise, nested routing, query-param seeding, migration 122 + idempotency/collisions, SEC-1/2, handoff prompts, stop conditions, recommendation |
| [MARKETING_END_TO_END_REBUILD_MAP.md](./MARKETING_END_TO_END_REBUILD_MAP.md) | Banner, §4 routing, §7 schema, §8 API guards, risk register, §19–20 Run A scope, P3 prerequisite |
| [MARKETING_COMMAND_CENTRE_REBUILD_PLAN.md](./MARKETING_COMMAND_CENTRE_REBUILD_PLAN.md) | §3.5 security, §8 routing, §10 campaign fields, §16 security, §17 schema, §22 batches |
| [MARKETING_CONTENT_CREATOR_UX_REDESIGN.md](./MARKETING_CONTENT_CREATOR_UX_REDESIGN.md) | Entry points, §4.0 routing restructure, asset seeding, approval_mode, migration 122 refs |

---

## 2. Security premise corrected

**yes**

**Before (incorrect):** Planning docs stated most marketing API routes were `requireAuth` only and looser than UI — Run A should add `requireRole("admin")` broadly.

**After (repo-verified):** `server/dev-api.mjs` lines 889–900 apply blanket middleware:

```js
app.use("/api/marketing", requireAuth, requireRole("admin"));
app.use("/api/intelligence", requireAuth, requireRole("admin"));
```

- Marketing and intelligence APIs are **admin-gated** at the chokepoint.
- Per-route `requireAuth` in `marketingRoutes.mjs` is **redundant**, not a gap.
- UI (`can.accessMarketing` → admin) **matches** API today.
- Run A security task = **confirmation audit** + document any routes outside prefix.
- Future marketing role = change **dev-api.mjs chokepoint**, not 30+ per-route guards.

---

## 3. Routing correction added

**yes**

**Before:** Docs assumed `/marketing/studio/legacy` was a simple route addition.

**After:** Documented that current `App.jsx` only has `/marketing` and `/marketing/:tab` (single segment). `/marketing/studio/legacy` is **two segments** and will not match `:tab`. Run A **requires** nested routing restructure (`App.jsx` `/marketing/*` or internal `<Routes>` in `Marketing.jsx`). Old tab URLs redirect 1 sprint. Explicit test gate added.

---

## 4. Query-param asset seeding added

**yes**

**Before:** Docs implied `seedAsset` parent state would survive routing move.

**After:** Standardised mechanism documented:

| Target | Query param |
|---|---|
| Legacy Studio (Run A) | `/marketing/studio/legacy?asset_id=<uuid>` |
| Creator shell / Creator (Run B) | `/marketing/studio?asset_id=<uuid>` |
| Planner deep link | `?campaign_id=&week_start=&asset_id=` |

- MediaUpload button → **“Open in Content Studio”**
- Legacy/Creator fetches asset via API; reads **`analysis`** jsonb (DB column name)
- Run B inherits same pattern
- Added to Run A scope, test gates, stop conditions (S3b)

---

## 5. Migration 111 references corrected

**yes**

- All literal `111_marketing_command_centre_mvp.sql` references → **`122_marketing_command_centre_mvp.sql`**
- Conceptual name: **marketing MVP migration**
- Banner added to all four docs: **Do not create `111_*.sql`**
- Noted **`112_document_templates.sql`** also taken — weekly_plans included in 122
- Handoff read order updated so Claude does not see stale 111 file instructions

---

## 6. Migration idempotency and name collisions corrected

**yes**

| Rule | Applied |
|---|---|
| All `ADD COLUMN IF NOT EXISTS` | Documented in handoff §3.0 |
| Idempotent seeds | `ON CONFLICT DO NOTHING` |
| Skip existing columns | Documented collision table in handoff §3.0b |

**Collisions resolved in docs:**

| Wrong (removed from plan) | Correct (use existing) |
|---|---|
| `approval_policy` | **`approval_mode`** (049) |
| `stage_tag` | **`stage_detected`** (046) |
| `photo_analysis` (DB) | **`analysis`** jsonb (046) |
| `captured_at` | **`capture_date`** (046) |
| `pipeline_status` | **`analysis_status`** (053) |
| Re-add `approved_at`, `reviewed_by`, `published_at` | **Skip** — exist in 046/062 |

Run B docs clarify: API generate **request body** may use `photo_analysis`; DB read/write uses `analysis`.

---

## 7. Remaining unresolved decisions

| ID | Decision | Blocks |
|---|---|---|
| **H1** | Sam approves corrected handoff doc | Run A authorisation |
| **H2** | Sam authorises creation of live `122_marketing_command_centre_mvp.sql` | Run A migration file |
| **D14** | Approve end-to-end map | Formal gate |
| **D1** | Josh role long-term (admin MVP vs marketing role) | Run B+ — not Run A blocker |
| **D4** | Sam approval policy mapping to `approval_mode` values | Run B labels |
| **D5** | Idea-first without media — warn vs block | Run B |

**Resolved by this pass (no longer block Run A planning):**

- SEC-1 admin-only — confirmed via blanket gate
- Migration number conflict — 122 assigned
- Schema name collisions — documented
- Nested routing requirement — documented
- Asset seeding mechanism — documented

---

## 8. Whether Run A handoff is now safe for Claude

**NO — parked during hardening freeze** ([SAM-MKT-001](../qa/SAM_DECISION_LOG.md)).

The corrected planning docs match verified repo facts for **future** Run A. Claude must **not** start until Sam reopens after P0/P1 hardening.

---

## 9. Remaining code facts that need verification

| # | Fact | Status | Verify during Run A |
|---|---|---|---|
| V1 | No marketing routes registered outside `/api/marketing` prefix | **Assumed yes** | Grep `dev-api.mjs` + route files during audit |
| V2 | `GET /api/marketing/media/:id` returns `analysis` for seed rehydration | **Likely yes** | Confirm response shape in Run A |
| V3 | Highest migration number before Run A | **121** (`121_site_diary_staff_rls.sql`) — 122 recommended | Re-check before creating file |
| V4 | `marketing_content_items.approved_by` column | **Not in 046** — only `reviewed_by` | Do not add unless confirmed needed; handoff omits `approved_by` on content items |
| V5 | CRM `/api/crm/lists*` guard | **requireAuth only** — not in marketing blanket | Out of Run A scope; document if lists exposed to non-admin staff |
| V6 | Exact nested routing approach | **Sam/Claude choice** — App.jsx vs Marketing.jsx internal routes | Either valid; must pass `/marketing/studio/legacy` test |

---

Next safe action:  
Sam continues Go-Live P0/P1 hardening. Marketing Run A remains parked until Sam explicitly reopens it after hardening.

Blocked by:  
Current feature freeze, dirty shared files, active P0/P1 hardening, uncommitted tree, or lack of explicit Sam Run A approval.

Code changed: no  
Tests changed: no  
Docs changed: yes

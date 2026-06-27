# Marketing Run A — Branch Doc Alignment Result

**Plan ID:** MARKETING-RUN-A-BRANCH-DOC-ALIGNMENT-01
**Date:** 2026-06-27
**Author:** Claude (planning-doc verifier)
**Mode:** Docs only — no product code, schema, routes, migrations, commits, or deploys
**Decision context:** [SAM-MKT-001](../qa/SAM_DECISION_LOG.md) — Marketing Command Centre Run A parked until post Go-Live P0/P1 hardening.

---

## 0. Preconditions (verified before any edit)

| Check | Result |
|---|---|
| Current branch | **`marketing-run-a`** ✅ |
| Working tree clean | **yes** — `nothing to commit, working tree clean` (0 modified / 0 untracked) |
| Highest migration on disk | **121** (`121_site_diary_staff_rls.sql`) |
| `122_marketing_command_centre_mvp.sql` available | **yes** — not present ✅ |

---

## 1. Key finding — corrections were already applied

The doc corrections in the approved task (`MARKETING-RUN-A-BRANCH-DOC-ALIGNMENT-01`) had **already been completed** on this branch by two earlier docs-only passes, both dated 2026-06-27:

- [MARKETING_RUN_A_DOC_CORRECTION_RESULT.md](./MARKETING_RUN_A_DOC_CORRECTION_RESULT.md) — `MARKETING-RUN-A-DOC-CORRECTION-PASS-01`
- [MARKETING_RUN_A_FREEZE_PARKING_RESULT.md](./MARKETING_RUN_A_FREEZE_PARKING_RESULT.md) — `MARKETING-RUN-A-FREEZE-PARKING-DOC-PASS-01`

This pass therefore **verified** the corrections (audit), found **no residual stale content requiring re-editing**, and recorded the one set of facts that post-dates those passes: the **branch now exists** and the **P0/P1 checkpoints have landed with a clean tree**. No already-correct content was re-edited (avoids redundant churn / regression risk).

---

## 2. Verification of each required correction (audit result)

### 2.1 Migration `111` wording purged — **yes (already done; verified)**

- No instruction-form `111_marketing_command_centre_mvp.sql` remains in any core doc.
- Every residual `111` reference is a **correct warning** ("Do not create `111_*.sql` — `111_workforce_rls_lockdown.sql` already exists").
- Planned future file documented as **`122_marketing_command_centre_mvp.sql`**, explicitly **not authorised during freeze**, with "re-check highest migration when Run A reopens."
- **122 re-checked this pass:** highest on disk is `121`, so 122 is still the correct next number.

### 2.2 Security premise corrected — **yes (already done; verified)**

- All docs state `/api/marketing` + `/api/intelligence` are **already admin-gated** via blanket middleware in `server/dev-api.mjs`.
- Run A security workstream marked **superseded by QA-001 / `npm run test:qa-sec-baseline`** during freeze.
- Explicit "**do not** bulk-add `requireRole`" and "**do not** edit `dev-api.mjs` auth middleware during freeze."
- Cross-checked against the program: `/api/marketing` + `/api/intelligence` are confirmed inside the prefix-gate loop in `dev-api.mjs`, validated by **QA-001 (CLOSED 2026-06-22)**. The only open marketing-adjacent security item is `W01-SEC-003` (public `/api/public/enquiry` rate-limit) — owned by the hardening stream, **public-by-design, not to be auth-gated**.

### 2.3 Schema / name drift corrected — **yes (already done; verified)**

Docs instruct use of existing DB names and forbid duplicates:

| Forbidden (drift) | Correct existing DB name |
|---|---|
| `approval_policy` | **`approval_mode`** (049) |
| `stage_tag` | **`stage_detected`** (046) |
| `photo_analysis` (DB) | **`analysis`** jsonb (046) — request body may still use `photo_analysis` |
| `captured_at` | **`capture_date`** (046) |
| `pipeline_status` | **`analysis_status`** (053) |

Future migration SQL requirements present in docs: **`ADD COLUMN IF NOT EXISTS`**, idempotent seeds, no duplicate existing columns, no destructive drops.

### 2.4 Routing / seeding kept future-only — **yes (already done; verified)**

- Nested routing for `/marketing/studio/legacy` and query-param asset seeding (`/marketing/studio/legacy?asset_id=` · `/marketing/studio?asset_id=`) documented as **future Run A requirements**, explicitly **not to be implemented during freeze**.

### 2.5 Decision state — **yes (already present; extended this pass)**

- `SAM_DECISION_LOG.md` already carried **SAM-MKT-001** (parked, planned-not-cancelled, full future start conditions, H1/H2 gates, migration 122 not authorised, security superseded by QA-001).

---

## 3. Edits made this pass (new facts only)

| File | Change |
|---|---|
| [SAM_DECISION_LOG.md](../qa/SAM_DECISION_LOG.md) | Added "Branch / checkpoint update" under SAM-MKT-001 (P0/P1 commits landed, tree clean, `marketing-run-a` branch exists + is a child of `portal-v2`, migration 122 re-confirmed, approval still required) + a document-history row. |
| [MARKETING_RUN_A_B_HANDOFF_READINESS.md](./MARKETING_RUN_A_B_HANDOFF_READINESS.md) | Added one branch-state line to the freeze banner (branch exists / clean tree / 122 confirmed / still not approved). |
| MARKETING_RUN_A_BRANCH_DOC_ALIGNMENT_RESULT.md | This result doc (new). |

**Not edited** (already correct — deliberately untouched): the four core planning docs' bodies (`COMMAND_CENTRE_REBUILD_PLAN`, `END_TO_END_REBUILD_MAP`, `CONTENT_CREATOR_UX_REDESIGN`, and the rest of `RUN_A_B_HANDOFF_READINESS`).

---

## 4. Branch / checkpoint state recorded

- Branch **`marketing-run-a`** created + on `origin`, cut from the clean `portal-v2` tip.
- It is a **child of `portal-v2`** (48 commits ahead of `main`, 0 behind), **not** an independent off-`main` branch. On merge it carries the whole portal-v2 stack; `main` auto-deploys to prod → keep Run A on `marketing-run-a` → **staging only**.
- Go-Live **P0 + P1 commits landed** (`8fe2603`, `f656d63`); tree clean.
- Migration **122** re-confirmed as next available number.

---

## 5. Result fields

| Field | Result |
|---|---|
| Current branch | `marketing-run-a` |
| Clean tree confirmed | **yes** |
| Docs updated | `SAM_DECISION_LOG.md`, `MARKETING_RUN_A_B_HANDOFF_READINESS.md`, this result doc |
| Migration 111 wording purged | **yes** (already done; verified — no stale instruction-form refs) |
| Security premise corrected | **yes** (already done; verified) |
| Schema / name drift corrected | **yes** (already done; verified) |
| Routing / seeding kept future-only | **yes** (already done; verified) |
| Product code changed | **no** |
| Schema changed | **no** |
| Routes changed | **no** |
| Live migration created | **no** |
| Remaining approval gates | **H1** (approve handoff) · **H2** (authorise migration 122) · explicit Sam Run A start-phase approval |
| Run A ready for explicit Sam approval | **Yes — docs are aligned and accurate.** Mechanical preconditions (clean tree, isolated branch, checkpoints landed, migration number confirmed) are met. Remaining gate is purely Sam's written approval. |

---

## 6. Report summary

- **Files changed:** `docs/qa/SAM_DECISION_LOG.md`, `docs/planning/MARKETING_RUN_A_B_HANDOFF_READINESS.md`, `docs/planning/MARKETING_RUN_A_BRANCH_DOC_ALIGNMENT_RESULT.md` (new).
- **Branch name:** `marketing-run-a`
- **Git status after work:** the three docs above are modified/new from this pass (uncommitted — no commit performed). **Concurrency note:** a separate **hardening agent** wrote three more files into the same `marketing-run-a` tree just before this pass (`MARKETING_ADJACENT_VERIFY_RESULT.md` new, `BUG_REGISTER.md` +46, `30_DAY_HARDENING_TRACKER.md` +1; timestamps 23:39–23:41 vs this pass 23:42–23:43). Those are **not** part of this doc-alignment pass and were left untouched — see §7.
- **Product code changed:** no
- **Schema changed:** no
- **Routes changed:** no
- **Migration created:** no
- **Run A remains unstarted:** yes — parked under SAM-MKT-001; no product code, no migration, no routing/UI work performed.

---

## 7. Concurrency alert — hardening agent on the marketing branch

During this pass, a separate **hardening agent** (audit-first) was running on the **same `marketing-run-a` working tree** and committed-to-disk three of its own outputs:

- `docs/qa/MARKETING_ADJACENT_VERIFY_RESULT.md` (new)
- `docs/qa/BUG_REGISTER.md` (+46 lines)
- `docs/qa/30_DAY_HARDENING_TRACKER.md` (+1 line)

**This is the parallel-agent entanglement the Go-Live P0 warns about — now occurring on the marketing feature branch.** Hardening audit output belongs on the hardening / `portal-v2` integration line, **not** on `marketing-run-a`. Mixing them risks a single commit on `marketing-run-a` capturing both tracks.

**Recommended (Sam):**
1. Confirm the hardening agent has stopped before anyone commits or switches branches off this tree.
2. Keep the two tracks separate when committing — the six changed files split cleanly by owner (3 marketing-doc-alignment vs 3 hardening-audit); commit per-track, not in one lump.
3. Re-point the hardening agent at the hardening line (not `marketing-run-a`) for any further work.

This pass took **no** action on the hardening agent's files (not mine; possibly mid-write).

---

Next safe action: Sam reviews the branch doc alignment result and decides whether to formally approve Run A.

Blocked by: Wrong branch, dirty tree, stale migration number, unclear decision state, or any need to touch product code during the doc pass.

Code changed: no
Tests changed: no
Docs changed: yes

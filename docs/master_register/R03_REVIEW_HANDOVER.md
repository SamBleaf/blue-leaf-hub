# Master Register R03 — review hand-over

For the independent review and staff pilot. Not merged, not deployed, no real client documents issued.

## Draft PR & commits

- **Repo:** `github.com/SamBleaf/blue-leaf-hub` (private) · **Branch:** `master-register-r02` → base `main` (merge-base is `origin/main`; clean diff).
- **Open the draft PR** (branch must be pushed first):
  ```bash
  git push -u origin master-register-r02
  gh pr create --draft --repo SamBleaf/blue-leaf-hub --base main --head master-register-r02 \
    --title "Master Register R03 — review (do not merge)" \
    --body-file docs/master_register/R03_REVIEW_HANDOVER.md
  ```
- **Review commits** (`git log origin/main..master-register-r02`): `0878555` review+release packs · `61cf36d` review-prep UX · `2a8de48` promotion-robustness fix · `c9571b9` Checkpoint E (switch, 214, SOPs, tech guide) · `e3d1b8c` C+D (documents, tender, baseline, handover, e2e) · `1a88109` A+B · plus the R02 increments and the doc-engine-r01 commits the document generation reuses.

## Amended this session

| File | Change |
|---|---|
| `supabase/migrations/213_master_register_r03.sql` | promote-mode no longer runs the evidence/technical guards (edit-only) — promotion is never stranded |
| `server/lib/registerStore.mjs` | `promoteRegisterToProject` handles `{ok:false}` — records `register.promotion_failed`, returns `ok:false` (no false success) |
| `scripts/tests/register-migration-213.test.mjs` | +4 checks (promotion tolerates unevidenced approval; edit-mode still blocks) → 74/74 |
| `src/components/sales/lead-detail/register/RegisterWorkshop.jsx` | full-width "Expand" workspace + sticky context strip (client/stage/drawing basis) |
| `src/components/sales/lead-detail/register/RegisterTable.jsx` | default vs Advanced filters; amber outstanding accent; "Assign an owner" nudge |
| `src/components/sales/lead-detail/register/DocumentsStep.jsx` | Draft vs Issued labels; pre-issue summary (project, recipient, drawing basis, doc no., scope) |
| `docs/master_register/R03_REVIEW_PACK.md`, `RELEASE_BLOCKER_REVIEW.md`, `R03_REVIEW_HANDOVER.md` | new review/release/hand-over docs |

## Test results (this session)

- **Unit + DB — 167/167:** register-r02 15 · r03-model 31 · feature-switch 7 · promotion 22 · mig-212 18 · mig-213 **74** (incl. the promotion-robustness regression).
- **End-to-end — 69/69** through the real Hub API on the loopback sandbox (all 25 acceptance scenarios; Scenarios A/B/C).
- **Lint + build** clean. No register console errors in the app (only the sandbox's AI-greeting 500, which has no API key).

## Screenshots (desktop / tablet / mobile)

`~/blh-register-evidence/review-ux/`: `desktop-01-register-in-column`, `desktop-02-expanded-workspace`, `desktop-03-documents-pre-issue`, `tablet-01-rooms-walkthrough`, `mobile-01-rooms-walkthrough`. Issued sample PDFs (fictional project): `~/blh-register-evidence/e2e-r03/`.

## Migration & security pack

`docs/master_register/RELEASE_BLOCKER_REVIEW.md` — read-only production checks (run before any apply), migration 214 reviewed as a separate security change, 212/213 dependencies/policy effects/rollback, apply order. **No production migration applied.**

## Outstanding release blockers

1. **Confirm migrations 103, 104, 188, 199 on production** — `has_104` (`auth_is_staff()`) is load-bearing: without it 213 silently skips the `room_scope_items` client-deny and the isolation invariant does not hold. Run §1 of the release pack.
2. **Approvals:** migration **214** (security, independent), then **212 → 213** (staging first, then production), on approval.
3. **Document design sign-off** — the doc-engine-r01 templates still await Sam's visual approval (separate track).
4. **Non-blocking review items** (flagged in the review pack, decisions for the reviewer, no behaviour change made): re-approval/lock applies to selections only — a `client_approved` requirement in `room_scope_items` is internal-only and unlocked (by design); the portal selection-choice UPDATE isn't re-gated on `client_visible` (narrow race, row stays hidden); the doc immutability trigger leaves attribution columns mutable; an issue retry can leave storage orphans.

## Safe pilot plan

1. Deploy the code with the **feature switch off** — no behaviour change (the pre-register Finishes/F&F lists still show). Confirm `/api/register/...` returns 404 `REGISTER_DISABLED`.
2. Apply **214** → VERIFICATION → `NOTIFY pgrst`.
3. Apply **212 then 213** on a staging/branch DB → VERIFICATION → production on approval.
4. `REGISTER_PILOT_LEADS=<one or two NEW leads>` (not existing jobs). Use it Discovery → Concept; issue the Client Brief to **Blue Leaf staff first**, never a client.
5. Review with Sam after the first concept meeting; then widen with `REGISTER_ENABLED=true`.
6. Rollback at any point: switch off (config), then the migration rollback blocks if needed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

# Master Register R04 — Release package & GO/NO-GO

**Prepared:** 2026-11-08 · **Branch:** `master-register-r02` (PR #1, not merged) · **Target:** Monday 9 Nov pilot
**Decision owner:** Sam. This document ends at a **STOP gate** — no merge, deploy, production migration, real
client email or portal invite happens without your explicit approval of the specific gate.

> One-line assessment: **Conditional GO.** The code is review-complete, fixed and tested, and ships **dark**
> (feature switch OFF → zero behaviour change). There is **no unresolved P0, data-integrity or isolation
> defect.** The remaining GO conditions are **not mine to clear**: a production preflight and a backup/restore
> point, both of which need your production access. Details in §12–§13.

---

## 0. Second independent-review response (2026-11-09)
ChatGPT's follow-up review of the branch at `aaf2b82` raised six correction items. All addressed on the branch
(separate commits, pushed); nothing merged/deployed/migrated.
1. **[P1 — fixed] Document actions must require a successful save.** `openPreview`/`issue`/`openPack` ignored
   `flush()`'s result — a failed/conflicted save could still preview or **issue a controlled document from
   stale data**. Fixed both client-side (`flushAll` awaits in-flight save + confirms clean; actions stop on
   failure with a clear message, edits kept) and server-side (preview returns a content fingerprint; issue
   refuses `409 ISSUE_STALE` before any write if the register changed). New `register-issue-stale` 7/7.
2. **[done] Slice 5 browser verification** — Kitchen + Bathroom observed live; all room families covered by the
   33/33 unit test. See `R04_BROWSER_VERIFICATION.md`.
3. **[partial — honestly scoped] Independent client/staff pilot** — single-operator staff checks done + issued
   PDF/DOCX retrieval incl. superseded revisions observed; two-party client flows left for the independent
   pilot and named as such (not claimed as done).
4. **[done] Migration reconciliation** — `PRODUCTION_PREFLIGHT_SQL_EDITOR.sql` (no `\echo`; pg_catalog column
   checks so a non-owner role can't mis-read), `R04_MIGRATION_EXECUTION.md` (ordered 212–216 table), PILOT_SEQUENCE
   now includes 215/216. Migration status is "to confirm via preflight", never asserted without prod access.
5. **[documented] Backup & production readiness** — `R04_PRODUCTION_READINESS.md` (PITR/restore, Railway/Vercel/
   Supabase, env + flags, known-good version, rollback, smoke tests); the backup/PITR confirmation is owner-only.
6. **This package + the PR description** updated to the actual state.

## 1. Scope of this release
Master Register R02→R04 + the document engine, as one PR. It adds a room-by-room project brief inside the
existing Sales pipeline, promotes it once into canonical project records (`client_selections` /
`room_scope_items`), issues controlled client/architect briefs + a selections schedule, records a contract
baseline, and surfaces a single server-grounded handover/portal status. R04 specifically corrected the
confirmed R04-pilot defects (selections release-readiness, issued-PDF retrieval, architect-tender stage,
employee UX, document classification, handover state) — **corrections, not a redesign.**

## 2. Commit range & diff scope
- **28 commits** ahead of `origin/main`; **~96 files**, +19k/−158 lines (reconciled against `origin/main`,
  not the stale local `main` which shows a false 1,639-file diff).
- Scope verified clean: every file is Master Register / doc-engine / its tests & docs. **No unrelated work
  rode along** (sanity-swept the non-register files — all are doc-engine render path, Slice 2 stage
  components, or register integration points).
- The six R04 slices + four review-fix commits:
  - Slice 1 P0-SEL · Slice 2 P0-ARCH+P0-DOC · Slice 3 DOC-CLASS · Slice 4 UX-ACTION-SAVE · Slice 5 UX-ROOM ·
    Slice 6 HAND-FIX, then four `R04 review-fix` commits (Slices 2/4/5/6) + release-prep docs.

## 3. Migrations (ordered) — files audited; production state is the open item
| # | File | What it does | Shape | Prod status |
|---|---|---|---|---|
| 212 | `212_master_register_promotion.sql` | `room_scope_items` + provenance/`client_visible` on `client_selections` | Additive (new nullable cols + 1 table), `IF NOT EXISTS`, reversible | **Not applied** |
| 213 | `213_master_register_r03.sql` | canonical write-through, readiness, issue registry, `register_apply` (SECURITY INVOKER, service-role only) | Additive, re-runnable, **fail-closed** (aborts if `auth_is_staff` / 104 absent) | **Not applied** |
| 214 | `214_internal_categories_deny_clients.sql` | closes a pre-existing RLS hole (mig 200 table had no client-deny) | Additive RESTRICTIVE policy, no data change | **Not applied** |
| 215 | `215_selection_changes_requested_status.sql` | widens the `client_selections` status CHECK for `changes_requested` | Forward, idempotent, **only adds a value → no existing row invalidated** | **Not applied** |
| 216 | `216_architect_tender_stage_fix.sql` | moves stranded architect-tender leads `accepted`→`tender` | **Scoped** to `lead_type='architect_tender'`, idempotent, column-guarded | **Not applied** |

- Independent review verdict on migrations: *"additive, idempotent, forward-only and fail-closed on missing
  prerequisites."*
- `scripts/dev/register-sandbox/MIGRATION_REPORT.md`: all **210 migration files (001–213) applied cleanly in
  order, 0 failures** on a fresh sandbox DB; 214/215/216 applied + tested on the sandbox since.
- **This is not an instruction to apply all five.** Apply order and gates are in `PILOT_SEQUENCE.md`
  (214 standalone first; 212→213 on staging then prod; 215/216 with 212/213). Production prerequisite state
  is unverified — see §12.

## 4. Test evidence (actually executed, 2026-11-08/09, against the isolated sandbox)
| Suite | Kind | Result |
|---|---|---|
| `register-room-prompts` | pure unit (Slice 5) | **33 / 33** |
| `register-issue-stale` | DB failure-injection (review §1) | **7 / 7** |
| `register-selection-readiness` | DB (Slice 1) | **23 / 23** |
| `register-handover-status` | DB (Slice 6) | **15 / 15** |
| `register-e2e` | DB end-to-end (3 seeded projects, 9+ flows) | **70 / 70** |
- `npm run lint` — clean (zero-warnings policy). `npm run build` — production build succeeds, PWA generated.
- All suites were **run**, not inspected. The sandbox has no mail/Xero/Cal/Dropbox keys → all external side
  effects are inert.
- Browser-observed outcomes (separate from the above) are recorded in **`R04_BROWSER_VERIFICATION.md`** — a
  single-operator staff walkthrough, explicitly **not** a full two-party pilot.

## 5. Independent review (Phase 2+4) — not self-certified
A separate multi-agent pass reviewed the 96-file diff (one reviewer per slice + a migrations/standards
reviewer), then **adversarially verified every finding**. Result: **7 confirmed defects, 0 dismissed** —
3× P1, 4× P2, all in slices 2/4/5/6. Slices 1, 3 and the cross-cutting migration/standards/security review
came back clean. **All 7 are now fixed, re-reviewed against the code, and covered by tests:**

| # | Sev | Slice | Defect (confirmed) | Fix |
|---|---|---|---|---|
| 1 | P1 | 2 | `window.open(…,"noopener")` returns null → issued-PDF open hardening was dead; PDF failed to open on Safari | Drop `noopener` from the pre-reservation (null the opener instead) |
| 2 | P2 | 2 | `openPack` opened post-await (popup-blockable), no pre-reservation | Same popup-safe pre-reserved tab |
| 3 | P2 | 4 | mixed batch painted a guard rejection **green "Saved"** | Latch rejection/conflict; re-flush can't repaint it |
| 4 | P2 | 4 | amber "conflict" badge unreachable | Same latch — now reachable |
| 5 | P1 | 5 | outdoor rooms (alfresco/balcony/external) lost their scope/layout lead prompt | Supersede must *replace* not remove; promote O-001/O-002 |
| 6 | P1 | 6 | `portal.invited` from `project_client_users` → every invited-but-not-signed-in client read "not invited"; staff told to re-invite | Derive "invited" from the `invitations` table or onboarding |
| 7 | P2 | 6 | same defect in the preconstruction-portal card | Same fix |

## 6. Standards & security
Cross-cutting review: no CLAUDE.md standards violations in the register server files (apiResponse ok/err,
constants, camelCase); new register/portal endpoints are role-gated via `requireAuth` (clients 403'd);
`register_apply` is service-role only; 214 closes the one known RLS gap. No new DB model; no duplicate fact
columns.

## 7. Dark-ship posture (why this is low-risk)
With `REGISTER_ENABLED` unset and `REGISTER_PILOT_LEADS` empty: `/api/register/*` → 404, the register card is
hidden, auto-promotion is skipped, Concept/Consultants fall back to the old lists. Code **and** migrations can
land with **zero behaviour change**; the pilot is turned on for **named leads only**.

## 8. Staging (isolated, for independent testing)
- Live single-origin HTTPS staging over the isolated sandbox (PG 54329 / PostgREST 54330 / gateway 54321 /
  Hub API 8797, loopback-only), rebuilt with all R04 fixes. No production connection; fictional data only;
  3 seeded projects (reno/extension, custom new home, small renovation); staff + client test logins.
- Browser evidence captured: the guided Kitchen room (Slice 5 — K-001 leads scope, generic prompt under
  "Explore more"). The staging is available for you / ChatGPT to independently drive all nine flows — that
  independent walkthrough is the staging's purpose and is **not** claimed as done here.

## 9. Deployment runbook & 10. Rollback
`PILOT_SEQUENCE.md` — Gate 0 (preflight) → Gate 1 (214) → Gate 2 (212+213 staging→prod) → Gate 3 (merge dark)
→ Gate 4 (pilot named leads) → Gate 5 (GA). **Kill-switch:** unset `REGISTER_PILOT_LEADS` + restart API →
register vanishes instantly, no data touched. Migration rollback blocks exist (213 before 212) but are
destructive — prefer the kill-switch.

## 11. Pilot checklist
`R04_MONDAY_PILOT_CHECKLIST.md` — one page, staff-facing, for Monday.

## 12. What I could NOT verify (honest gaps — need your production access)
1. **Production prerequisite migrations (103/104/188/199/200).** 212/213/214 depend on them; 213 fail-closes if
   104 is absent. **Run `docs/master_register/PRODUCTION_PREFLIGHT.sql` on prod** (read-only; now covers
   §1–§8 incl. 215/216) and confirm the expected-good baseline. I cannot reach production.
2. **Backup / restore point.** No production backup evidence — migrations should only be applied with a
   current, restore-tested backup in place. That is yours to confirm.
3. **Full 9-flow interactive staging walkthrough on prod-like data** — partial (one screenshot + 70 automated
   e2e flows). Independent human/ChatGPT walkthrough still recommended before Gate 4.

## 13. GO / NO-GO
- **No NO-GO blocker in the code:** the first review's 7 findings **and** the second review's §1 data-integrity
  P1 (issue-from-stale-data) are all fixed and tested; no P0, data-integrity or isolation/security defect remains
  outstanding; lint + build green; scope clean; ships dark. (The §1 P1 is a reminder the review loop is working —
  it was a real defect my own pass missed; it is now closed with a failure-injection test.)
- **GO is conditional on two owner-only preconditions (§12.1, §12.2):** the production preflight passes, and a
  restore-tested backup is in place. Until both are confirmed, migrations must not be applied.

**Recommendation:** Proceed to **Gate 0** — run the preflight on production and send me the output. On a clean
preflight + backup confirmation, the sequence is GO to Gate 1 (apply 214), then Gate 2, with the switch still
OFF. **I am stopping here for your approval. Nothing will be merged, deployed, or migrated until you approve
the specific gate.**

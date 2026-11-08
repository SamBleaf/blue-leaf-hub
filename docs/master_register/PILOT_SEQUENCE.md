# Master Register R03 — smallest safe staging → pilot sequence

The minimum path from "reviewed on a branch" to "a few staff using it on real leads", with the **exact
approvals** that are yours to give at each gate. Nothing here runs automatically. Each **[APPROVAL]** is a
separate decision — one does not imply the next. Default state today: code is on `master-register-r02`
(PR #1, not merged); **feature switch OFF**; migrations **212–216 prepared**; their live state is **to be
confirmed by the production preflight** (this project applies migrations by manual SQL paste, so "applied" =
schema/data state, not a CLI ledger — see `R04_MIGRATION_EXECUTION.md`).

Design intent that makes this safe: the code ships **dark**. With the switch off, `/api/register` returns
404, the register card is hidden, auto-promotion is skipped, and Concept/Consultants fall back to the old
lists. So the code and even the migrations can land with **zero behaviour change**, and the pilot is turned
on for **named leads only**.

---

## Gate 0 — Production preflight (read-only, no change)
- **Do:** run `docs/master_register/PRODUCTION_PREFLIGHT.sql` against the **production** DB (Supabase SQL
  editor or a read-only psql). It writes nothing.
- **Pass criteria:** §1 `has_103/104/188/199/200` all `t`; §2b shows **only** `internal_categories (auth_users:true)`
  (or nothing); §6 returns **zero rows**. (`has_212/213` are still `f` here — expected.)
- **If §1 `has_104` is `f`:** STOP — apply migration 104 first; without it 213 aborts by design and no register
  table has client-deny. If §6 returns any value: add it to the 213 CHECK list (or reconcile the data) before Gate 2.
- **[APPROVAL A]** — you confirm the preflight output matches the expected-good baseline. ← *you run this; I can't reach production.*

## Gate 1 — Apply migration 214 (independent security fix; do this regardless of the register)
- **Why first:** 214 is standalone — it closes a pre-existing hole where any authenticated user (incl. a portal
  client) could read/write `internal_categories`. It does not depend on 212/213.
- **Do:** apply `214_internal_categories_deny_clients.sql` → run its VERIFICATION block → re-run PREFLIGHT §2b
  (now **zero rows**) → `NOTIFY pgrst, 'reload schema';`.
- **Rollback:** `DROP POLICY IF EXISTS deny_clients ON public.internal_categories;`
- **[APPROVAL B]** — apply 214 to production.

## Gate 2 — Apply 212 → 213 → 215 → 216 on a STAGING / branch database first
- **Do (staging only), in this order:**
  1. `212` then `213` (order matters — 213's ON CONFLICT targets 212's indexes; 213 fail-closes without 104).
  2. `215` — widens the `client_selections.status` CHECK for `changes_requested` (adds a value only; no row
     can be invalidated).
  3. `216` — the scoped data correction that moves stranded `architect_tender` leads `accepted → tender`
     (preflight §8 shows the count first; re-running moves 0).
  Run each migration's VERIFICATION block (every row `true`) → `NOTIFY pgrst, 'reload schema';`.
- **Verify on staging:** re-run the full PREFLIGHT (§0 now `has_212/213/214/215=true`; §2a all six tables
  carry `deny_clients`; §7 `already_has_215=true`; §8 `stranded=0`; §9 function-privilege `false|false|false|true`).
- **Exercise the UN-GATED paths that touch the altered tables** (these are NOT behind `registerEnabledFor`, so
  they go live the moment 212/213 + the code land, even with the switch off):
  - run `runPortalNightlySync()` (server/lib/portalSync.mjs) end-to-end on the 212/213 staging DB and confirm it
    still succeeds and `client_selections.status`/`updated_at` behave as before (the new `register_touch_updated_at`
    trigger + `client_visible` column must not change existing-row behaviour; 212 defaults `client_visible=true`);
  - load an existing (pre-212-shaped) client portal and confirm the Selections board + "coming up" list show the
    same rows as before — the portal read/write filter now adds `.eq('client_visible', true)` (portalV2Routes.mjs),
    un-gated. Both are expected behaviour-neutral; this step is what proves it.
- **[APPROVAL C]** — apply 212+213+215+216 to **production** (same order, same VERIFICATION), with the switch
  still OFF. No user sees any change yet.

## Gate 3 — Merge the code behind the OFF switch
- **Do:** merge PR #1 to `main` and deploy (Vercel + Railway) with **`REGISTER_ENABLED` unset / false** and
  `REGISTER_PILOT_LEADS` empty. The register stays invisible; fallback lists remain.
- **Smoke:** load a normal lead — no register card, old behaviour intact; `/api/register/...` → 404.
- **[APPROVAL D]** — merge + deploy the dark code.

## Gate 4 — Pilot on named leads only
- **Do:** set `REGISTER_PILOT_LEADS=<lead-id>[,<lead-id>]` on Railway for **one or two internal / test leads**
  (not `REGISTER_ENABLED=true` globally). Restart the API. Only those leads get the register.
- **Run the loop once, end to end, on a pilot lead:** capture a room-by-room brief → preview D1/D2/D3 →
  issue D1 (staff-gated) → confirm the client portal shows only the two deliberately-issued selections →
  record a baseline. **Do not** email a real client or invite a real client in the pilot.
- **Watch (concrete signals):**
  - Activity: `SELECT event_type, created_at, metadata FROM job_events WHERE event_type LIKE 'register.%' AND job_id = '<pilot job>' ORDER BY created_at DESC;` (events are `register.document.issued`, `register.baseline.recorded`, `register.promotion_failed` — the last only when the lead has a job).
  - Promotion failures in Railway logs: grep for `[finalize-won] register promotion:` (salesRoutes.mjs) and `promotion failed (nothing written` (registerStore.mjs).
  - Client-isolation probe (run during the pilot): re-run PRODUCTION_PREFLIGHT §2a/§2b against prod, OR sign in as a portal client on the pilot project and confirm `room_scope_items` and the internal register columns on `client_selections` are NOT readable. **A failed probe = trigger the kill-switch below immediately.**
- **[APPROVAL E]** — widen `REGISTER_PILOT_LEADS` to a first real client lead, with the client-document
  send / portal-invite still done deliberately per lead.

## Gate 5 — General availability (later, separate decision)
- Flip `REGISTER_ENABLED=true` once the pilot is clean. **[APPROVAL F]**

---

## Rollback & kill-switch (fastest abort first)
1. **Kill-switch (instant, non-destructive):** unset `REGISTER_PILOT_LEADS` (and ensure `REGISTER_ENABLED` is
   off) on Railway and restart the API. The register disappears for everyone immediately; no data is touched.
   This is the first move for any isolation-probe failure or unexpected behaviour.
2. **Code rollback (Gate 3):** redeploy the previous Vercel build + Railway release. The dark code leaves no
   trace with the switch off, so this is only needed if the deploy itself misbehaves.
3. **Migration rollback (Gate 1/2) — DESTRUCTIVE, last resort:** run the ROLLBACK block at the foot of the
   migration, **213 before 212**, then 214's `DROP POLICY`. ⚠️ Rolling back 213/212 **DROPs the register
   columns/tables**, which **destroys any staged or promoted register data created during the pilot**. Only do
   this after confirming the pilot lead's register data can be discarded. Prefer the kill-switch — it needs no
   rollback at all.

---

### Remaining approvals, in order
**A** preflight sign-off · **B** apply 214 · **C** apply 212+213+215+216 (staging→prod) · **D** merge+deploy
dark · **E** turn on pilot leads · **F** general availability.

### Hard stops (unchanged this phase)
No merge, no deploy, no production migration, no real client document or portal invite **until you approve the
specific gate**. I prepare and verify; the production actions are yours.

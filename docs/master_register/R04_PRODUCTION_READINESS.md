# Master Register R04 — production readiness & recovery

Backup/restore, deploy topology, env/flags, rollback, and post-deploy smoke tests for the R04 release.
Items marked **[OWNER]** need Sam's production access to confirm — I cannot reach production.

## 1. Backup / restore (confirm BEFORE any migration) — [OWNER]
- [ ] **Supabase PITR / backups:** confirm the production project has Point-in-Time Recovery enabled (Pro
      plan) **or** a fresh daily backup, and note the latest restore point timestamp. Migrations 212–216 must
      only be applied with a known-good restore point in place.
- [ ] **Restore procedure (rehearse the decision, not the data):** in the Supabase dashboard → Database →
      Backups, a restore rolls the whole project back to a timestamp. Because the register migrations are
      additive and the code ships dark, the realistic recovery path is the **kill-switch + code rollback**
      (§4), not a DB restore — a DB restore would also roll back unrelated production writes since the
      timestamp, so it is the last resort. Confirm you know how to trigger a restore and roughly how long it
      takes for this project's size.
- [ ] **Pre-migration safety net:** since migrations here are manual SQL-Editor pastes, take the preflight
      output (`PRODUCTION_PREFLIGHT_SQL_EDITOR.sql` §0) as the "before" snapshot and keep it. 215/216 also
      carry their own rollback notes (`R04_MIGRATION_EXECUTION.md`).

## 2. Deploy topology
- **API — Railway.** Start command `npm run start` (`server/dev-api.mjs`, `PORT` from env). All server secrets
  live here. The register endpoints are part of this service.
- **Frontend — Vercel.** Static Vite SPA. `vercel.json` rewrites `/api/:path*` to the Railway host. Build =
  `npm run build`. Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **DB/Auth — Supabase.** Service-role key (server, bypasses RLS) + anon key (browser, RLS applies). Supabase
  Auth Site URL + redirect URLs point at the Vercel domain.

## 3. Environment variables & feature flags for R04
- **Feature switch (ships OFF):**
  - `REGISTER_ENABLED` — unset / `false` for the pilot. `true` only at Gate 5 (general availability).
  - `REGISTER_PILOT_LEADS` — comma-separated lead IDs. Empty for the dark deploy (Gate 3); set to one or two
    named leads at Gate 4. **This is the pilot on/off control.**
  - With both off: `/api/register/*` → 404 `REGISTER_DISABLED`, the register card is hidden, auto-promotion is
    skipped, Concept/Consultants fall back to the legacy lists. No new env var is required to deploy dark.
- **No new external integration** is introduced by R04 (no new mail/Xero/Cal/Dropbox keys). The register sends
  nothing externally; documents are issued to storage and downloaded by staff.
- **Set on Railway** (API): `REGISTER_ENABLED` / `REGISTER_PILOT_LEADS` as above. Restart the API after a flag
  change (the server reads the flag at request time, but restart to be certain of a clean state).

## 4. Rollback / recovery (fastest, non-destructive first)
1. **Kill-switch (instant):** unset `REGISTER_PILOT_LEADS` (ensure `REGISTER_ENABLED` off) on Railway → restart
   API. Register disappears for everyone; **no data touched.** First move for any isolation-probe failure or
   unexpected behaviour.
2. **Code rollback:** redeploy the previous known-good Railway release and Vercel build (see §5). The dark code
   leaves no trace with the switch off, so this is only needed if the deploy itself misbehaves.
3. **Migration rollback (last resort, DESTRUCTIVE):** 213 ROLLBACK before 212 ROLLBACK, then
   `DROP POLICY deny_clients ON internal_categories` (214). 215: re-add the CHECK without `changes_requested`
   (only once no row uses it). 216: none (re-running is a no-op; reverting would re-strand leads). ⚠ 212/213
   rollback DROPs the register tables/columns → destroys any staged/promoted register data. Prefer the
   kill-switch.

## 5. Previous known-good version — [OWNER to record at deploy time]
- [ ] **Railway:** note the current production release ID / deployment before deploying R04 (Railway →
      Deployments) so step §4.2 can redeploy it.
- [ ] **Vercel:** note the current production deployment URL/commit before promoting the R04 build.
- [ ] **Git:** the last `main` commit before merge is the known-good app version (record its SHA).

## 6. Post-deployment smoke tests
**After the dark deploy (Gate 3), switch OFF — prove nothing changed:**
- [ ] Load a normal lead → **no** register card; old Concept/Consultants lists render.
- [ ] `GET /api/register/leads/<any>` → `404 REGISTER_DISABLED`.
- [ ] An existing client portal loads; Selections board + "coming up" show the same rows as before (212/213's
      `client_visible` default = true must not hide anything).
- [ ] App smoke: sign in (staff + a client), open Sales pipeline, open a project, open Finance — no errors in
      Railway logs or the browser console.
- [ ] Portal nightly sync (`runPortalNightlySync`) completes without error against the 212/213 schema.

**After turning on a pilot lead (Gate 4), switch ON for that lead only:**
- [ ] The register card appears **only** on the pilot lead(s); a non-pilot lead still shows none.
- [ ] Capture a room → **preview** a brief (requires a clean save) → **issue** → the issued PDF **and** DOCX
      open/download (both must exist). Re-issue after an edit → P02 supersedes P01; P01 still retrievable.
- [ ] A selection with no proposed product stays staged / not client-actionable; a configured selection
      reaches the client, who can Accept or Request changes; staff see a distinct `changes_requested`.
- [ ] Sign in as the pilot client → only the deliberately-issued selections are visible; nothing unissued.
- [ ] Handover panel shows the five distinct states + one next action; the client is **not** auto-invited.
- [ ] Watch: `SELECT event_type, created_at, metadata FROM job_events WHERE event_type LIKE 'register.%' AND
      job_id = '<pilot job>' ORDER BY created_at DESC;` and Railway logs for `[finalize-won] register
      promotion:` / `promotion failed`.
- [ ] Client-isolation probe: re-run preflight §2a/§2b on prod **or** sign in as the pilot client and confirm
      `room_scope_items` + the internal `client_selections` columns are not readable. A failed probe → kill-switch.

## 7. What is NOT verified here
Everything under **[OWNER]** (backup/PITR config, restore rehearsal, known-good release IDs) and the
production smoke tests themselves — they run against production, which I cannot reach. This document is the
plan; the evidence is produced when you (or the pilot operator) run it.

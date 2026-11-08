# Register sandbox: a local Supabase-compatible stack (DEV / TEST ONLY)

This folder runs the **real** Blue Leaf Hub (Express API + Vite SPA, both on `@supabase/supabase-js`) end to end against a **disposable local database** that has **no connection to production**.

- It never reads the repo `.env` or any `.env.*` file.
- It never connects to a remote Supabase or Postgres host.
- It never sends mail or any other outbound message. Password recovery, invites and magic links are returned to the caller or logged. They are never delivered.
- Secrets, logins and data live **outside the repo** in `~/.blh-register-sandbox/`.

Do **not** point any of this at production. Do **not** run the repo's e2e, `test-critical-paths`, `batch-a` or playwright suites against it, or at all from this context, because they target production.

## Components and ports

| Component | Address | Role |
|---|---|---|
| Postgres 17 (Homebrew) | `localhost:54329`, plus the unix socket in `~/.blh-register-sandbox/run/` | database `blh`, superuser `postgres` (socket = trust, TCP = scram) |
| PostgREST 16 | `127.0.0.1:54330` | connects as `authenticator`, then switches to `anon` / `authenticated` / `service_role` from the JWT |
| Gateway (`gateway.mjs`) | `http://localhost:54321` | the "Supabase URL": `/rest/v1`, `/auth/v1`, `/storage/v1` |
| Hub API (`sandbox.mjs api`) | `http://localhost:8797` | `server/dev-api.mjs` with hub.env only |
| Vite SPA (`sandbox.mjs vite`) | `http://localhost:5184` | the SPA with `import.meta.env` taken from hub.env only; `/api` goes to `:8797` |

## Quick start

Run these from the repo root. Prerequisites: `brew install postgresql@17 postgrest`, Node 20+, and the repo `node_modules`. The scripts use the repo's own `pg`, `jsonwebtoken` and `@supabase/supabase-js`, so there are no new dependencies.

```bash
node scripts/dev/register-sandbox/sandbox.mjs init        # cluster + shim + ALL migrations + seed + config (once)
node scripts/dev/register-sandbox/sandbox.mjs postgrest   # terminal 1 (foreground)
node scripts/dev/register-sandbox/sandbox.mjs gateway     # terminal 2 (foreground, one log line per request)
node scripts/dev/register-sandbox/sandbox.mjs api         # terminal 3: Hub API on :8797
node scripts/dev/register-sandbox/sandbox.mjs vite        # terminal 4: SPA on http://localhost:5184
node scripts/dev/register-sandbox/smoke.mjs               # self-test (starts/stops its own PostgREST + gateway;
                                                          #  needs ports 54330/54321 free)
```

Other commands:

| Command | What it does |
|---|---|
| `start` / `stop` | start or stop Postgres |
| `status` | shows the cluster, migrations, ports and paths |
| `reset` | drops and recreates database `blh`, re-applies everything and wipes storage. Secrets and logins are kept. |
| `migrate` | applies only the migration files that are not yet recorded in `sandbox_meta.sandbox_migrations`. Use it after a new `supabase/migrations/2xx_*.sql` lands. |
| `report` | rewrites `MIGRATION_REPORT.md` |
| `psql` | prints the connection command |

### Why `api` and `vite` instead of `npm run dev`

Server modules call dotenv's `config()`, which reads **`<cwd>/.env`**. Many of them also use the parsed values directly, for example `_env.ANTHROPIC_API_KEY`. So if you start the Hub from the repo root, the **production** `.env` gets loaded (mail, Dropbox, Anthropic, Xero and so on), even when `hub.env` is exported.

`sandbox.mjs api` avoids this in three ways:

- It starts the Hub with a clean environment that contains only the `hub.env` variables plus PATH and HOME.
- Its working directory is `~/.blh-register-sandbox/hub-cwd/`. The `.env` there is a copy of `hub.env`, and `docs`, `src`, `public` and `shared` are symlinked back to the repo for the paths that are relative to cwd.
- On macOS it runs under `sandbox-exec`, which blocks all outbound network traffic except loopback and unix sockets. `--allow-network` turns this off.

`sandbox.mjs vite` uses `vite.sandbox.config.mjs`, which wraps the repo's `vite.config.js` with these changes:

- `envDir` is set to hub-cwd, so the repo `.env` is never read for `VITE_*`.
- It runs on port 5184 with strictPort.
- It uses its own dependency cache in `~/.blh-register-sandbox/vite-cache`.

## Files

In the repo (this folder only):

| File | Purpose |
|---|---|
| `sandbox.mjs` | the runner CLI |
| `lib.mjs` | paths, ports and env scrubbing |
| `shim.sql` | Supabase platform emulation, applied before the migrations |
| `seed.sql` | staff and client users, profiles, buckets |
| `gateway.mjs` | HTTP gateway |
| `smoke.mjs` | self-test |
| `vite.sandbox.config.mjs` | Vite wrapper config |
| `MIGRATION_REPORT.md` | migration outcome table |
| `workarounds/` | optional; only created if a migration ever needs one |

Runtime files in `~/.blh-register-sandbox/` (never in the repo; mode 0600/0700):

| Path | Contents |
|---|---|
| `secrets.json` | `jwt_secret` (48 chars), `anon_key`, `service_key` (HS256 JWTs, 10-year expiry), Postgres passwords. Generated once and kept across `reset` and `init --force`. |
| `credentials.local.json` | `register.sandbox@blueleaf.test` (admin) and `client.sandbox@blueleaf.test` (client), with random passwords |
| `hub.env` | exactly `SUPABASE_URL`, `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_ANON_KEY`, `PORT_API=8797`, `NODE_ENV=development` |
| `hub-cwd/` | the Hub's working directory (`.env` = hub.env, plus symlinks) |
| `postgrest.conf` | PostgREST config |
| `pg/` | the Postgres cluster |
| `run/` | the unix socket |
| `storage/<bucket>/<path>` | object bytes, plus a `<path>.meta.json` sidecar |
| `logs/` | `postgres.log`, `migrate-*.json`, smoke child logs |

## Migrations

`init` and `reset` apply **every** `supabase/migrations/*.sql` file in filename sort order. Each file gets its own `psql -1 -v ON_ERROR_STOP=1` run, and success is recorded in `sandbox_meta.sandbox_migrations`. That schema is private, not exposed and not in `public`, so migrations that loop over public tables never see it. A failing file is reported and the run continues, so you get the full list of irreducible failures. `--stop-on-error` stops at the first failure instead.

Rules for fixes:

- **Platform gaps are fixed in `shim.sql` and never by editing a migration.**
- A genuine migration bug that blocks later files gets a clearly named workaround: `workarounds/<migration-basename>.before.sql` and/or `.after.sql`. It runs in the same transaction as that migration and is recorded in the tracking row. Document why at the top of the file.

## What the gateway emulates

**`/rest/v1`** is streamed to PostgREST with the method, headers and body unchanged, including `Prefer`, `Range`, `Accept-Profile` and `Content-Range`. On top of that it emulates Supabase in these ways:

- Like Kong, it requires a valid `apikey` (401 otherwise). If there is no `Authorization` header, it forwards `apikey` as the Bearer token, and it hides the apikey from PostgREST.
- Like pg-safeupdate, a PATCH or DELETE with no filter fails with `21000 … requires a WHERE clause`.
- It sets CORS once and strips PostgREST's own CORS headers.

**`/auth/v1`** (GoTrue subset backed by `auth.users`, with bcrypt via pgcrypto):

- **Tokens and sessions:** `token?grant_type=password|refresh_token`, `GET/PUT /user`, `logout` (global, local or others; it ends the sessions, so a revoked JWT then returns 403 `session_not_found`), `recover` (sends nothing), `verify` (GET redirect / POST), `settings`, `health`.
- **Admin API** (needs the service_role key): `admin/users` (list, create, get, update, delete, soft delete) and `admin/generate_link`, which returns the link and sends nothing.
- **Access tokens** are HS256 and carry `sub`, `role`, `aud`, `email`, `exp`, `iat`, `app_metadata`, `user_metadata`, `session_id`, `aal` and `amr`. Error bodies carry `code`, `error_code` and `msg`, and responses include `X-Supabase-Api-Version: 2024-01-01`.

**`/storage/v1`** (storage-api subset):

- **Objects:** upload (POST, raw or multipart; an existing object without `x-upsert: true` gives HTTP 400 `{"statusCode":"409","error":"Duplicate",…}`), update (PUT), download, `authenticated/` and `public/` routes (public buckets only), HEAD, Range, `info`, bulk remove, single DELETE, `list` (folders plus files, Supabase shape).
- **Signed URLs:** `sign` (single and batch; the token is a JWT bound to `bucket/path`) and serving files from a signed URL.
- **Buckets:** list, create, get, update, delete, empty.
- **Access control:** each object has a row in `storage.objects`, and every operation by an anon or authenticated caller runs inside a transaction as that role with `request.jwt.claims` set. So the **storage RLS policies from the migrations really apply**, for example `lead_documents_staff_all`. The service role bypasses RLS. Writes need an authenticated or service_role JWT.

**Not available:** `/realtime/v1`, `/functions/v1` and `/graphql/v1` return 404, and websocket upgrades are refused.

## Known gaps vs hosted Supabase

- **No realtime, edge functions, GraphQL or email/SMS delivery.**
- **Auth:** no OAuth/SSO/MFA/phone/anonymous sign-in, and no signup endpoint (the app doesn't use one). Email change is applied immediately.
- **Storage:**
  - no image transforms (`render/image` only serves public originals)
  - no signed upload URLs, `move` or `copy`
  - bucket `file_size_limit` and `allowed_mime_types` are not enforced (the global 50 MB limit is)
- **PostgREST is 16.5.** Hosted projects may run an older major version. Error codes differ in places, for example a missing relation is `PGRST205` and not `42P01`. The app checks for both.
- **Gateway:** no rate limits, and it does not check JWT `aud`.

## Safety notes

- Ports bind to loopback only (Postgres `localhost`, PostgREST `127.0.0.1`, gateway `127.0.0.1` and `::1`).
- Child processes get a scrubbed environment with no inherited `PG*`, `DATABASE_URL` or `SUPABASE_*`.
- `lib.mjs` refuses to run if the sandbox dir resolves inside the repo.
- `hub.env` contains no mail, Dropbox, Drive, Xero, Anthropic, Resend, Cal or Buildexact variables, so every integration reports not-configured.
- The Hub still defaults `PORTAL_SYNC_ENABLED` and `IMAP_POLL_ENABLED` on. The IMAP poller skips because it is unconfigured, and the portal sync only touches the sandbox DB.

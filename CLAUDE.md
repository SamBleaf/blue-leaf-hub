# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start both API server (port 8787) and Vite dev server concurrently
npm run start        # API only — used by Railway (`PORT` env)
npm run build        # Production Vite build
npm run lint         # ESLint (zero warnings policy — --max-warnings 0)
npm run auth:gmail   # One-time OAuth flow for Gmail sending (outputs GMAIL_REFRESH_TOKEN) — optional, SMTP is default
npm run auth:drive   # One-time OAuth flow for Google Drive only (outputs GOOGLE_DRIVE_REFRESH_TOKEN)
npm run auth:dropbox # One-time OAuth flow for Dropbox (outputs DROPBOX_REFRESH_TOKEN)
npm run test:smtp    # Verify SMTP credentials
```

There is no automated test suite. All features are verified manually via the running app.

## Architecture

### Two-process dev setup

`npm run dev` runs two processes in parallel:
- **API server** — `server/dev-api.mjs` (Express). Listens on `PORT` (Railway/cloud) or `PORT_API` / **8787** locally. All server logic lives under `server/lib/`.
- **Vite dev server** — proxies `/api/*` to the Express server. Frontend-only code never calls the API directly on a port; it always goes through `/api/`.

### Production deploy (Vercel + Railway)

Typical split: **static SPA on Vercel**, **Express API on Railway**, **VentraIP** (or any registrar) for DNS only.

1. **Railway** — New project → deploy this repo → set **all server secrets** (`SUPABASE_SERVICE_ROLE_KEY`, Anthropic, SMTP, Dropbox, etc.). Railway injects **`PORT`**; the API uses `PORT` automatically. Start command: **`npm run start`** (see `railway.toml`).
2. **Edit `vercel.json`** — Replace **`YOUR-RAILWAY-HOST`** in the `/api/:path*` rewrite with your Railway hostname (the subdomain before `.up.railway.app`), or replace the whole `destination` URL if Railway uses a **custom domain**. That reverse-proxies `/api` so the browser stays same-origin and you keep using relative `/api/...` fetches. Alternatively, configure the same rewrite in the Vercel project **Redirects/Rewrites** UI instead of committing the hostname.
3. **Vercel** — Import repo → production env: **`VITE_SUPABASE_URL`**, **`VITE_SUPABASE_ANON_KEY`**, plus any other `VITE_*` the app needs. Build output is **`dist`** (`npm run build`).
4. **Supabase Auth** — After you attach a custom domain on Vercel, set **Site URL** and **redirect URLs** to that domain.
5. **VentraIP DNS** — Point the apex/`www` records at Vercel per [their domain docs](https://vercel.com/docs/domains/working-with-dns); do not point the domain at Railway unless you intentionally split origins (then you would need CORS and a configurable API base URL).

You can validate **before** changing DNS by opening the **`*.vercel.app`** deployment and confirming `/api/...` flows resolve once the Railway hostname in step 2 is correct.

Also supported: serve **`dist/`** from the same Express process (single server); this repo does not enable `express.static` for `dist` by default — use Vercel + rewrite or wire static serving yourself if you prefer one host.

### Frontend: React + React Router v6

Single-page app. All routes are defined in `src/App.jsx`. Layout is `src/components/AppShell.jsx` (sidebar on desktop, bottom drawer on mobile), which wraps all department routes via `<Outlet />`.

The app is organized into two live departments:
- **Tender Manager** — routes under `/tender-manager/*`
- **Operations Manager** — routes under `/operations/*`

### Server: Express route registration pattern

`server/dev-api.mjs` is the entry point. Routes are registered by calling `register*Routes(app)` functions from `server/lib/`:
- `registerModule4Routes` — RFQ engine: Claude extraction, PO generation, sending, Buildexact sync
- `registerModule5Routes` — Fee proposals: parse XLSX/PDF, generate DOCX, DOCX→PDF, Google Drive upload, email send
- `registerModule6Routes` — Operations: schedule generation (Claude), site diary PDFs, WHS, schedule Gantt
- `registerInductionRoutes` — Site induction QR/form (no auth, public `/induct/:projectId`)
- `registerJobsApiRoutes` — Job CRUD helpers, Dropbox job folder creation, Buildexact job lookup

### Supabase

**Frontend** uses `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (anon key, row-level security applies). Client: `src/lib/supabaseClient.js` → `getSupabase()`.

**Server** uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (service role, bypasses RLS). Client: `server/lib/supabaseService.mjs` → `getServiceSupabase()`. Both return `null` if env vars are missing — all callers must guard against this.

Database schema is in `supabase/migrations/` (numbered 001–012). Apply in order via Supabase dashboard SQL editor. Key tables: `jobs`, `subcontractors`, `rfqs`, `fee_proposals`, `cost_intelligence`, `projects`, `purchase_orders`, `correspondence`, `schedule_tasks`, `site_diary`, `contractor_compliance`, `site_inductions`, `unmatched_quote_emails`, `sequences`.

### External integrations (all optional — app degrades gracefully)

| Service | Env vars | Purpose |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` | RFQ extraction, schedule planning, PDF parsing |
| Gmail OAuth | `GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN/SENDER_EMAIL` | Outbound email via Gmail — optional, SMTP is the default |
| Google Drive | `GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN` | Fee proposal Google Docs workflow only — independent of email |
| SMTP fallback | `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | Email when Gmail not configured |
| IMAP | `IMAP_HOST/PORT/SECURE/USER/PASS` | Inbound quote email polling |
| Dropbox | `DROPBOX_APP_KEY/SECRET/REFRESH_TOKEN` | Job folder structure, file uploads |
| Google Drive | `GOOGLE_DRIVE_FOLDER_ID` (optional) | Fee proposal edit folder; uses Gmail OAuth credentials |
| Buildexact | `BUILDEXACT_API_URL/USERNAME/API_KEY` | Sync jobs, create POs |

**Mail transport** (`server/lib/notifyMail.mjs`) automatically prefers Gmail OAuth over SMTP — all email sending goes through `sendPlainMail()`.

### Fee Proposal flow (Module 5)

1. User imports Buildexact XLSX or PDF → `/api/fee-proposal/parse-xlsx` or `parse-pdf` (Claude reads PDF)
2. Wizard step 2 — edit structured fields in the browser
3. Step 3 — "Open in Google Docs": generates DOCX via `generate-docx` → uploads as a Google Doc via `upload-to-drive` → opens edit URL in new tab
4. "Send PDF to client": calls `docx-to-pdf` with the Drive file ID → exports PDF from Google Drive → uploads to Dropbox at `[job address]/internal/presale docs/` → emails PDF via `send`

DOCX generation uses **docxtemplater v3** with **angular-expressions** parser. Template variables use single-brace `{VAR}` syntax; `normaliseDocxTemplate()` pre-processes the ZIP to convert any `{{VAR}}` double-brace placeholders and fix hardcoded header text. The Word template (`BLB_TENDER_TEMPLATE.docx`) is stored in `localStorage` under `TEMPLATE_STORAGE_KEY` (`blhub_fee_proposal_docx_template_b64`).

### Dropbox path structure

```
/BLUE LEAF BUILDING/PROJECTS/BLUE LEAF BUILDING/[job address]/
  TENDER DOCS/         ← RFQ documents, sent quotes
  INTERNAL/
    QUOTES/            ← received subcontractor quotes
    PRESALE DOCS/      ← fee proposal PDFs
```

The path root uses a Dropbox team namespace (`DROPBOX_NAMESPACE_ID` or resolved via API). `dropboxClient.mjs` handles token refresh, namespace routing, and all file operations.

### Styling

Tailwind CSS with a custom design token palette (defined in `tailwind.config.js`):
- `primary` (#006c9b), `accent` (#2E6B4F), `warning` (#D4A24C)
- `surface` (white), `page` (#F8F9FA), `ink`, `muted`, `hairline`
- `rounded-card` (12px), `rounded-lg` (8px)
- Utility class `.focus-ring` for accessible focus states
- Font: Lato

Use these tokens throughout — do not use raw hex values in JSX.

# W22 — CRM Relationships / Mailing List

**Batch:** E (Supporting Systems) · **Mapped:** 2026-06-27 (hardening agent) · **Status:** mapped
**Source-of-truth:** this file. **Evidence:** read-only fan-out (backend/frontend/schema/tests) + main-loop spot-check.
**Format:** 23-section Batch-A. Evidence labels: `[code]` verified from code · `[docs]` from SOP/docs · `[infer]` inferred · `[unconf]` needs testing · `[SAM]` open decision.

---

### 1. Business intent
Maintain Blue Leaf's relationships (prospects, referrers, past clients, consultants) and run **Spam-Act-compliant** mailing-list email campaigns. CRM feeds the sales pipeline (contact→lead conversion) and credits referrers against won jobs.

### 2. Start trigger
A contact is created (manual, CSV import, or public enquiry→lead path) `[code crmRoutes.mjs:389,922]`; a campaign starts when staff compose an `email_sends` draft and trigger it `[code :994,1045]`.

### 3. End / handoff
- Contact → **lead** via `POST /api/crm/contacts/:id/convert` (W01 handoff) `[code :574-614]`.
- Referrer → **job credit** via `job_contact_roles` + `recomputeReferralRollup()` (W09/finance handoff) `[code :211-261,663]`.
- Campaign → Resend → delivery webhooks update stats + unsubscribe state `[code :1045,1244]`.

### 4. Main users
Admin/Director (full CRM + campaigns); supervisors/employees currently have **no UI** (admin-only RoleRoute) but the API is reachable with any staff token (see §17) `[code frontend SalesManager/Marketing admin-only; backend requireAuth-only]`.

### 5. Blue Leaf workflow (business)
Capture contact + **consent source** (Spam Act) → segment into manual/smart lists → compose campaign → send → honour unsubscribes/bounces → track engagement → convert/credit. `[docs SOP 17-01..04]`

### 6. Hub workflow (system)
`crm_contacts` ⇄ `crm_interactions`; `mailing_lists`(+`smart_filter`) → `mailing_list_members`(consent, per-list unsub) → `email_sends` → `email_send_recipients`(resend_email_id) → Resend → `/api/webhooks/resend` → counters + `email_unsubscribes` audit. `[code/schema]`

### 7. SOP interpretation
4 SOPs exist (`docs/sops/17_crm_mailing_list/17-01..04`), all `test_status: untested` `[docs]`. SOP 17-04 documents consent-source requirement + JWT unsubscribe + Resend send. No SOP documents the **per-list vs global** unsubscribe asymmetry (a real operator-confusion gap) `[docs/infer]`.

### 8. Code interpretation
`crmRoutes.mjs` (1383 LOC) registers 24 routes; registered in `dev-api.mjs:933` with **no** admin prefix-gate (intentional — keeps public `/unsubscribe` + webhook open) `[code]`. Relationship score = `scoreContact()` (:102-146). Smart lists computed live via `smartListMembers()` (:148-166). `[code]`

### 9. Entry points
`POST /api/crm/contacts`, `/contacts/:id/interact`, `/lists`, `/lists/:id/members`, `/lists/:id/import`, `/sends`, `/sends/:sid/send`; public `GET /api/crm/unsubscribe`, `POST /api/webhooks/resend`. `[code]`

### 10. Exit points
`POST /contacts/:id/convert` → `leads`; `job_contact_roles` CRUD → referral rollup; Resend batch send → outbound email + webhook. `[code]`

### 11. Screens
Admin-only: `/sales/dashboard` (CrmDashboard), `/sales/contacts` (CrmContacts + ContactDrawer), `/marketing` lists tab (MailingLists + ListDetail + SendEmailModal). `[code frontend]`

### 12. Routes (auth posture)
| Route | Auth | Sensitivity |
|---|---|---|
| GET /api/crm/dashboard, /contacts*, /search, /lists* | `requireAuth` | PII read (any staff) |
| job-contact-roles (GET/POST/PUT/DELETE) | `requireAuth`+`requireRole("admin")` | finance (fees) — **gated** `[code :623,663,696,722,734]` |
| **POST /api/crm/sends** | `requireAuth` only | **outbound email — UNGATED** `[code :994]` |
| **POST /api/crm/sends/:sid/send** | `requireAuth` only | **bulk send — UNGATED** `[code :1045]` |
| **POST /api/crm/lists/:id/import** | `requireAuth` only | **bulk PII import — UNGATED** `[code :922]` |
| GET /api/crm/unsubscribe, POST /api/webhooks/resend | public | by design `[code :1203,1244]` |

### 13. Database ownership
Owns: `crm_contacts`, `crm_interactions`, `mailing_lists`, `mailing_list_members`, `email_sends`, `email_send_recipients`, `email_unsubscribes` (mig 061) + `increment_send_stat` RPC (mig 073) + `job_contact_roles` (mig 083, shared w/ finance). RLS: permissive `authenticated USING(true)` + RESTRICTIVE `deny_clients` (mig 104) → **role enforcement must be at API layer** `[schema]`. **No global-unsubscribe column** — unsubscribe state is per-list on `mailing_list_members.unsubscribed_at`; `email_unsubscribes` is the audit/event log `[schema]`.

### 14. External integrations
**Resend** (batch send + Svix webhooks; signature verify is **fail-open** until `RESEND_WEBHOOK_SECRET` set) `[code :48-78,1244-1252]`. JWT unsubscribe tokens (`UNSUBSCRIBE_SECRET`, 90d) `[code :40,1106]`.

### 15. Existing tests
**None automated for CRM send/consent.** W01 batch-a covers contact create/convert/activity `[code w01-leads.mjs]`. `adversarial_e2e.mjs` checks client cannot read `crm_contacts` `[code :104-114]`. Harness for new security tests = Playwright `api-security` project + `apiAsRole(role,...)` (`e2e/helpers/api.mjs`) — same project as `test:qa-sec-baseline`. `[code]`

### 16. Drift risks
- **W22-SEC-001** (see §23) — global-unsubscribe gap + send/import role-bypass + non-idempotent stats. **CONFIRMED.**
- Webhook signature **fail-open** until `RESEND_WEBHOOK_SECRET` set `[code]` `[SAM ops: set secret before go-live]`.
- `UNSUBSCRIBE_SECRET` falls back to a hardcoded string if `JWT_SECRET`/`SUPABASE_JWT_SECRET` unset `[code :40]` `[SAM ops]`.
- Consent source static (no re-consent/withdrawal mechanism); `email_unsubscribes` unbounded (no retention) `[schema]` — LOW.
- `req.user?.id` used for `created_by` but `requireAuth` sets `req.caller` → audit fields silently NULL (Tier-4 hygiene, **out of W22-SEC-001 scope**) `[code :950,966,1007]`.

### 17. Security / role risks
Any **employee** token can: trigger bulk customer email (`/sends/:sid/send`), create sends, mass-import PII (`/lists/:id/import`) `[code]`. RLS is permissive for all authenticated staff (no per-row scoping) — so the API-layer role check is the only control, and it is **missing** on these three. Public unsubscribe/webhook are correct by design. `[code/schema]`

### 18. Required handoff data
contact→lead: name/email/phone/suburb/project_type carried + `referred_by_contact_id` `[code :574]`. referrer→job: `job_contact_roles.credits_referral` + canonical contract value `[code :211-261]`.

### 19. Handoff failure risks
`recomputeReferralRollup` is best-effort (catches) → stale `referral_*`/score if it fails `[code]`. Convert is non-transactional (lead insert + contact update; activity non-fatal) `[code :574-614]`.

### 20. Acceptance criteria
Sends only reach **consented, non-unsubscribed** recipients; unsubscribe (any channel) suppresses future sends; only **admin** can trigger sends / import; engagement counters are accurate under webhook retries; client role denied (RLS) `[infer from SOP + Spam Act]`.

### 21. Required tests
- **W22-SEC-001** (this batch): employee→403 on `/sends`, `/sends/:sid/send`, `/lists/:id/import`; admin allowed. (Playwright `api-security`, `apiAsRole`.)
- W22-SEC-002 (planned): unsubscribed/bounced contact excluded from a send's recipients (both smart + manual).
- W22-SEC-003 (planned): webhook retry does not double-count `delivered/opened/clicked/bounced`.
- W22-API-01 (planned): smart-list filter returns only matching active contacts.

### 22. Open decisions
- **SAM-W22-001** — unsubscribe semantics: **global** (any unsubscribe suppresses all lists) vs strict per-list consent. **Decided 2026-06-27: global suppression** (Sam approved the W22-SEC-001 fix batch). Recorded here as the source-of-truth. `[SAM]`
- SAM-W22-002 (ops, not code) — set `RESEND_WEBHOOK_SECRET` + a real `JWT_SECRET` before go-live.
- SAM-W22-003 (LOW) — consent retention/expiry + `email_unsubscribes` archival policy.

### 23. Smallest-safe fix plan — W22-SEC-001 (APPROVED 2026-06-27; staging only; one drift item)
1. **Role-gate (security):** add `requireRole("admin")` after `requireAuth` on `POST /api/crm/sends` (:994), `POST /api/crm/sends/:sid/send` (:1045), `POST /api/crm/lists/:id/import` (:922). **Do NOT** touch the prefix-gate loop or the public `/unsubscribe`+webhook.
2. **Global suppression (consent / Spam Act):** in `/sends/:sid/send`, after recipients are resolved (smart **and** manual), exclude any whose email appears in `email_unsubscribes` (the global opt-out log). Closes the smart-list-honors-nothing hole.
3. **Bounce → suppression log:** in the webhook `email.bounced` branch, also insert an `email_unsubscribes` row (mirrors complaint) so hard bounces enter the global suppression set.
4. **Idempotent stats:** gate each `increment_send_stat` for `delivered/opened/clicked/bounced` on the first state transition (`delivered_at IS NULL` etc. via conditional `.update().select()`), so Resend retries can't double-count. (Complaint/unsubscribed left as-is — rare; documented residual.)
5. **Regression test:** `e2e/tests/security/crm-send-role.spec.js` (api-security) — employee→403, admin→not-403 on the three routes.

**Schema change:** none. **Migration:** none. **Routes changed:** 3 (role-gate) + webhook handler (suppression/idempotency). **Files:** `server/lib/crmRoutes.mjs` only.

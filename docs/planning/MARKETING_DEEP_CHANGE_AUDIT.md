# Marketing Command Centre — Deep Change Audit

**Doc ID:** MARKETING-DEEP-CHANGE-AUDIT
**Date:** 2026-06-28
**Branch:** `marketing-run-a` (isolated worktree `blh-marketing.nosync`) · **Merge base:** `f656d63`
**Mode:** Review only. No build, no merge, no boot, no migration, no live integration.

---

## 1. Executive summary

**Built (vs merge base `f656d63`):** 63 files, +7,428 / −105. One migration (`122`), 7 server route modules, ~55 `/api/marketing/*` endpoints, 1 internal router + ~22 frontend components, full SOP suite (18-01..18-08), staging scaffolding, and a deep planning trail.

**Material changes:** a complete media-first marketing workflow — Command Centre → Planner → Studio (+Legacy) → Approval Queue → Calendar → Vault → Evergreen → Intelligence → Attribution — layered additively on the existing 062-era marketing tables, plus 122's new package/scheduling/evergreen schema.

**Safe today:** code is static-clean (lint 0-warn, build OK); schema is verified read-only **8/8** against live 122; every change is on an isolated branch; no production code merged; no integration fires from the code paths in scope. Migration 122 is additive/non-destructive and already applied to main.

**Unverified:** every runtime behaviour — auth gate responses, UI render with real data, and **all write flows** (package create, approval cascade, calendar schedule, publish-log, evergreen mark). Deferred to staging or explicit live approval. Demo fallbacks currently mask any latent runtime/data-shape fault behind clearly-labelled placeholders.

---

## 2. Route audit (`/marketing/*`)

| Route | Purpose | Component | Status | Depends on | Runtime risk |
|---|---|---|---|---|---|
| `/marketing` | Weekly home + readiness | `MarketingCommandCentre` | New | `command-centre` API | Low (read snapshot) |
| `/marketing/planner` | Plan week from template | `WeeklyPlanner` | New | `planner`, `templates`, campaigns | Med (slot create writes) |
| `/marketing/studio` | Media-first creator | `ContentCreator` | New | `generate`, `content`, `packages`, `media` | Med (AI + writes) |
| `/marketing/studio/legacy` | Original prompt generator | `LegacyStudio`→`ContentGenerator` | Preserved | `generate/stream`, `content` | Med (must not regress) |
| `/marketing/approval` | Review/approve packages | `ApprovalQueue` | New | `packages`, `packages/:id/approve` | Med (status cascade write) |
| `/marketing/calendar` | Week view + mark posted | `MarketingCalendar` | New | `calendar`, `publish-log` | Med (publish-log write) |
| `/marketing/vault` | Browse/filter media | `MediaVault` | New | `media` | Low (read + client filter) |
| `/marketing/evergreen` | Reusable content | `EvergreenLibrary` | New | `evergreen` | Low (read) |
| `/marketing/intelligence` | Pipeline health | `MarketingDashboard` | New | `intelligence` | Low (read, safeCount) |
| `/marketing/attribution` | Lead source view | `MarketingAttribution` | New | `attribution` | Low (read leads) |
| `/marketing/create` | → redirect to studio | `Navigate` | Compat | — | None |
| `/marketing/:tab` (library, campaigns, media, lists, music) | Legacy tab pages | `Marketing.jsx` | **Legacy (kept 1 sprint)** | legacy 062 APIs | Med (older patterns) |

---

## 3. API audit (`/api/marketing/*`, ~55 endpoints)

All sit behind the blanket prefix gate `requireAuth + requireRole("admin")` (dev-api `:906`) **and** carry inline `requireAuth`. Grouped by surface:

| Group | Endpoints (representative) | R/W | Tables touched | Needs 122 | Risk | Hardening note |
|---|---|---|---|---|---|---|
| Command Centre | `GET command-centre` | R | content_items, media, campaign slots | partial | Low | Confirm counts match UI tiles |
| Planner/Campaigns | `GET planner·templates·campaigns/*`, `POST campaigns·from-template·slots*` | R/W | marketing_campaigns, *_slots, **campaign_templates** | **Yes** | Med | Slot/campaign writes untested |
| Studio generate | `POST generate·generate/stream·generate/all-save·assemble` | W(+AI) | content_items; **Anthropic** | No | Med | AI key + model; falls back to demo |
| Content/Library | `GET/POST/PUT/DELETE content·content/:id` | R/W | marketing_content_items | No (legacy) | Low | Pre-122 safe path |
| Media | `GET media*`, `POST media/upload·analyse·consent·export` | R/W | media_assets; Storage | No | Med | Upload/analyse heavy; not in core smoke |
| Packages/Approval | `GET packages·packages/:id`, `POST packages`, `PATCH packages/:id/approve` | R/W | **marketing_content_packages**, content_items | **Yes** | **Med-High** | Approval cascades child status — must test |
| Calendar/Schedule | `GET calendar`, `POST schedule·publish-log`, `GET publish-log` | R/W | content_items.**scheduled_at**, **social_post_publishes.publish_mode** | **Yes** | Med | Manual log only — no external post |
| Evergreen | `GET evergreen`, `POST content/:id/evergreen` | R/W | content_items.**evergreen_score** | **Yes** | Low | Score persist untested |
| Intelligence | `GET intelligence` | R | content_items, publishes, media, campaigns | optional | Low | `safeCount` swallows missing-table errors |
| Attribution | `GET attribution` | R | **leads** (+ enquiry_attribution opt) | No | Low | Reads lead PII → admin-only correct |
| Music | `GET/POST/PATCH/DELETE music*` | R/W | music tables; Storage | No | Low | Has explicit `requireRole("admin")` |

**Write endpoints never call external services** (no posting, email, Buildxact, Dropbox). Generate calls Anthropic only.

---

## 4. Database / schema audit

| Item | State |
|---|---|
| Migration 122 | **Applied to main** (2026-06-28); additive, idempotent, non-destructive (only `DROP POLICY IF EXISTS`+recreate); ends `NOTIFY pgrst` |
| 122 tables | `marketing_content_packages`, `marketing_weekly_plans`, `drone_shot_plans`, `marketing_paid_campaigns`, `marketing_publish_jobs`, `marketing_campaign_templates` |
| 122 new columns | `marketing_content_items`: `package_id, operational_labels, risk_level, generation_metadata, scheduled_at, evergreen_score`; `social_post_publishes.publish_mode` |
| Verified read-only (8/8) | templates=7, packages join, content_items new cols, publishes join, calendar, evergreen, attribution leads — all resolve |
| Write-flow risk (unverified) | INSERT `marketing_content_packages` + child items; UPDATE child status on approve; INSERT `social_post_publishes (publish_mode=manual)`; UPDATE `evergreen_score`; campaign/slot INSERTs |
| Mismatch risk | Low for reads (proven). Writes use camelCase→snake mapping via apiResponse; RLS on new tables is `*_authenticated` — **service client bypasses RLS**, so RLS itself is untested at runtime |

---

## 5. UI / workflow audit

| Surface | What changed | Strong | Could confuse | Must runtime-test |
|---|---|---|---|---|
| Command Centre | +weekly-loop strip, +readiness panel | Clear orientation; loop is explicit | Readiness panel is static (says so) | Snapshot counts accurate |
| Planner | +template/slot/channel helper | Template→slots→studio deep-link | "slot vs post" wording | Slot create + deep-link carries ids |
| Studio | Numbered steps, helpers, pkg summary, legend, next-step | Coherent 3-step flow; metadata visible | "From idea" with no photo still allows generate | Generate, save draft, send package |
| Legacy Studio | Untouched (banner only) | Preserved escape hatch | Two studios may puzzle | Generate/stream/save **no regression** |
| Approval Queue | +shared legend; demo-on-`!ok` only | Decisions clear, risk/labels shown | none material | Approve/request/reject cascade |
| Calendar | shared banner; mark-posted | Manual-only is explicit | "scheduled" source vs slots | publish-log write (`publish_mode`) |
| Vault | demo-on-`!ok`; filter helper; empty vs filtered | True empty state now | analysis status meaning | Live list + `?asset_id=` seed |
| Evergreen | demo-on-`!ok`; shared banner | Score sort | empty vs demo (now fixed) | Score persist + resurface |
| Intelligence | shared banner; stale-122 copy removed | Read-only, safeCount-safe | demo vs empty pipeline | Real counts, no demo on live |
| Attribution | shared banner | Window picker; unknown bucket | "source" inference caveat | Source breakdown on real leads |

---

## 6. Demo / live state audit

Post Batch 1+2 the vocabulary is consistent via shared `MarketingStateBanner` (Demo/Empty/Error) + `ReviewLegend`:

| Component | Demo trigger | Verdict |
|---|---|---|
| MediaVault, EvergreenLibrary, ApprovalQueue, MediaPickerModal | **only `!ok`** (fixed) — live-empty shows true empty | ✅ no masking |
| MarketingCalendar | `!ok`/`!data` | ✅ |
| MarketingDashboard, MarketingAttribution | backend `demo:true` flag | ✅ (server decides) |
| **`src/pages/Marketing.jsx` (legacy tabs: library/campaigns/media/lists/music)** | older inline patterns, **not** reviewed in Batch 1/2 | ⚠️ **residual masking risk** — audit or retire before relying on these |

Demo never implies a save (Studio demo drafts non-savable; Approval demo actions disabled; Calendar mark-posted disabled on demo). The one open item is the **legacy tab page** which predates the cleanup.

---

## 7. Security / auth audit

| Aspect | Finding |
|---|---|
| Marketing gate | `for (prefix of [... "/api/marketing" ...]) app.use(prefix, requireAuth, requireRole("admin"))` (dev-api `:906`) — blanket admin gate covers **all** `/api/marketing/*` |
| Per-route | Each route also has inline `requireAuth`; music adds inline `requireRole("admin")` |
| Fragility | Most write routes rely on the **blanket** gate for the admin check (inline is `requireAuth` only). If the prefix list is edited at merge, sensitive writes would drop to any-authenticated-staff. **Hardening: add explicit `requireRole("admin")` on package/approve/publish-log/schedule writes** as defense-in-depth |
| Client lockout | `requireAuth` rejects `role==="client"` → portal clients cannot reach marketing | 
| Public routes | Attribution/enquiry **ingest** is `/api/public/attribution` + `/api/public/enquiry` in `marketingIntelligenceRoutes` (separate module, intentionally public) — not part of this branch's new gated surface |
| PII | `attribution` returns lead names/sources — admin-only is correct |
| Non-admin UI | `RoleRoute` + nav hide `/marketing/*` from non-admins (frontend); server gate is the real enforcement |
| Must runtime-test | 401 without token; 403 for supervisor/employee/client on a write endpoint |

---

## 8. Background job / runtime safety audit

Booting the **full** `dev-api` against the live `.env` starts live background jobs — this is why a blind full-boot is unsafe for a marketing smoke:

| Job | Location | Gate | Risk on boot |
|---|---|---|---|
| Invoice IMAP poll | `financeRoutes.mjs:~1380` | **`invoiceImapConfigs().length` only — ignores `IMAP_POLL_ENABLED`** | **Connects to live invoice inbox ~10s after boot** |
| Quote IMAP poll | `dev-api.mjs:2394` | `IMAP_POLL_ENABLED` (default true) | Live Gmail poll (disablable) |
| Portal nightly sync | `dev-api.mjs:2382` | `PORTAL_SYNC_ENABLED` (default **true**) | Finance reconcile / portal milestone advance |
| RFQ reminder cron | `dev-api.mjs:2358` | `REMINDER_CRON_ENABLED` (default false) | Off by default |

**Before any live runtime smoke:** set `PORTAL_SYNC_ENABLED=false`, `IMAP_POLL_ENABLED=false`, **and** blank invoice-IMAP creds (or fix the finance poller to honour a flag — recommended P1). Marketing's own code triggers none of these; the risk is purely from co-resident jobs in the shared server. Prefer a staging Supabase per the 4A strategy.

---

## 9. Merge risk audit

Target: portal-v2 (`0ad4dac`), **currently dirty** with a redesign agent active in `App.jsx` / `AppShell.jsx`.

| File | Conflict likelihood | Notes |
|---|---|---|
| `src/App.jsx` | **High** | Marketing adds `/marketing/*` mount; redesign agent editing same file live |
| `src/components/AppShell.jsx` | **High** | `MARKETING_MODULES` nav vs redesign nav changes |
| `server/dev-api.mjs` | Medium | +12 lines (import + 7 `register*` calls + Batch3); W22 touched `crmRoutes`, not dev-api — low overlap |
| `src/pages/Marketing.jsx` | Low-Med | Legacy tab page edits |
| `docs/sops/SOP_INDEX.md` / `SOP_CHANGELOG.md` | Low | Append-only; trivial to resolve |
| Migration numbering | **Verify** | 122 is next free (portal-v2 at 121); re-confirm no other branch claimed 122 at merge |
| `docs/planning/*` | None | All new marketing files |
| New server modules + components | None | New files only |

W22 commits (`crmRoutes.mjs`, `package.json`, e2e spec) touch **zero** marketing files — clean on the committed side.

---

## 10. Hardening checklist (ranked)

**P0 — before merge**
- [ ] Main tree clean / redesign committed; rebase marketing onto current main
- [ ] Resolve `App.jsx` + `AppShell.jsx` conflicts (nav + mount) without dropping redesign or marketing
- [ ] Re-confirm migration **122 still the next free number**
- [ ] `npm run lint` + `npm run build` green on merged tree

**P1 — before deploy (runtime smoke on staging / approved live)**
- [ ] Auth: 401 no-token; 403 non-admin on a write; client blocked
- [ ] All 10 routes render real (non-demo) data
- [ ] Write flows: package → approval cascade → calendar schedule → publish-log (`publish_mode=manual`); evergreen mark persists
- [ ] Legacy Studio generate/save no regression
- [ ] Fix or neutralise **finance IMAP poller** (`IMAP_POLL_ENABLED` not honoured) before live boot
- [ ] Add explicit `requireRole("admin")` to package/approve/schedule/publish-log writes (defense-in-depth)
- [ ] RLS spot-check on new 122 tables (service client bypasses RLS today)

**P2 — cleanup after deploy**
- [ ] Audit or retire legacy tab page (`Marketing.jsx`) + nav tabs (library/campaigns/media/lists)
- [ ] Remove `ContentCreatorShell.jsx` (orphan) + old-name SOP files (18-02..18-07 pre-rebuild)
- [ ] Gate/remove demo constants once staging-verified
- [ ] Address pre-existing main-bundle size warning (code-split marketing)

---

## 11. Recommendation

**Pause merge; do one final cleanup batch, then prep merge — do not merge into the dirty main tree yet.**

Rationale: the module is code-complete, static-clean, and schema-verified; the two highest-risk merge files (`App.jsx`, `AppShell.jsx`) are being actively edited by the redesign agent right now, so merging today guarantees avoidable conflicts. Best sequence:
1. **Now:** optional P2-lite cleanup that touches *only* marketing-owned files (orphans, old SOP names) — zero merge surface added.
2. **When main settles:** P0 merge prep (rebase + resolve nav/mount), then a **staging runtime smoke** (P1) before any deploy.
3. The finance IMAP poller fix and the explicit role guards are the two substantive hardening items — neither blocks merge, both block a *live* smoke.

---

Next safe action: Sam reviews `MARKETING_DEEP_CHANGE_AUDIT.md` and decides whether to begin merge preparation.

Code changed: no
Tests changed: no
Docs changed: yes

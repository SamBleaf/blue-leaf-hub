# Architect Handover — Client Portal v2 + Ecosystem Cohesion

**Date:** 2026-06-22 · **Branch:** `portal-v2` · **State:** uncommitted, verified green, ready to commit.

This session built the **Client Portal v2.0** client-facing experience, then hardened **every module connection that feeds it** (the "ecosystem cohesion" work) and added a **Hub-wide records-filing foundation**. Everything below is on `portal-v2`, **uncommitted**, for you to commit.

## Verification state (all green)
- `npm run build` ✓ · `npx eslint src/…` → 0 warnings (server `*.mjs` is outside the lint scope) · every edited `*.mjs` passes `node --check` · server boots clean.
- **`node scripts/real_data_dryrun.mjs` → 27 passed / 0 failed** — the deterministic live E2E against real `jobs`/`job_variations`/`progress_claims`, self-cleaning.
- **`node scripts/verify_migrations.mjs`** → all portal migrations present (only the pre-existing `101 lead_documents.ptsa_signed_document_path` shows missing — unrelated, in the deferred 099–102 set).

## Migrations (per Sam: ALL APPLIED to prod)
- Already committed on `portal-v2`: `103`, `103b`, `104`, `105`.
- **NEW, to commit:** `108_portal_ecosystem_cohesion.sql` (portal_decisions +`withdrawn`; portal_claims +`partially_paid`/`void`; +`paid_to_date`), `110_portal_dispute_and_photo_visibility.sql` (portal_claims +`disputed` +`dispute_reason`; project_photos +`client_visible`; notification_type +`claim_paid`/`variation_approved`).
- Numbering: `106`/`107` are yours, `109` is carpentry — mine are `108` + `110`.

---

## The changeset

### Portal-owned files — safe to commit as-is (18 modified + new)
**Server (portal core):**
- `server/lib/requirePortalAuth.mjs` — JWT/token auth; v2-flag gate (403 on non-v2); 503 migration-presence guard.
- `server/lib/portalV2Routes.mjs` — ~24 client endpoints; notifications scoped to `target_user_id` (+ mark-read); Home crash guard (`is_current` order+limit); inc-GST contract total; void-exclusion; document signing; photo-visibility gate; payment-notify void/disputed guard.
- `server/lib/portalV2AdminRoutes.mjs` — admin endpoints; expose-document (null-guard + signature action + notify); register-document; awaiting-sign; client-users activate/deactivate; updates GET/PATCH (publish); photos GET/PATCH.
- `server/lib/portalIntegration.mjs` — Finance→Portal hooks: sent/signed/rejected/**voided**, claim issued/paid/**voided**/**disputed**; v2-gate in `projectForJob`; diary→draft update; partial-pay split; claim_paid/variation_approved notifications.
- `server/lib/portalNotify.mjs` — `notifyClient` + a **single v2-gate chokepoint** (no notifying non-v2 projects).
- `server/lib/portalSync.mjs` — nightly milestone/selection sync; `schedule_change` emitter; **finance reconciliation** (re-fires + heals void/signed/paid status-drift); client-identity backfill; targets `portal_v2_enabled`.
- `server/lib/portalRoutes.mjs` — legacy token surface; builder-message → `message_reply` notify.
- `server/lib/requireAuth.mjs` — rejects `role:'client'` from staff endpoints.
- `server/lib/jobRecordsFiler.mjs` **(NEW)** — central `fileJobRecord({category, register, exposeToPortal})` → INTERNAL/<folder> + optional job_document + optional client-visible portal_document.
- `server/lib/dropboxClient.mjs` — full `INTERNAL/` records taxonomy in `ensureExtendedJobFolders` (note: also independently edited — `DROPBOX_TEMPLATES_BASE` etc.; reconcile).
- `server/dev-api.mjs` — portal nightly sync **decoupled** onto its own default-on timer (`PORTAL_SYNC_ENABLED`, default true).

**Frontend:**
- `src/components/RootRedirect.jsx` — `role:'client'` → `/client-portal` (was `/my-portal`).
- `src/pages/clientportal/*` + `ClientPortalLayout.jsx` + `NotificationBell.jsx` **(NEW)** — 6-nav portal, bell.
- `src/pages/PortalV2Admin.jsx` — admin console + new sections (register-contract, photos, awaiting-sign, client access, draft-updates publish).
- `src/lib/clientPortalApi.js` — `portalPatch` helper.

**Scripts/docs (new):** `scripts/real_data_dryrun.mjs`, `docs/portal_audit/PORTAL_ECOSYSTEM_COHESION_AUDIT.md`, `…/PORTAL_ECOSYSTEM_FIX_PLAN.md`, `…/PORTAL_TEST_GUIDE.md`, `docs/records/JOB_RECORDS_FILING_PLAN.md`.

### ⚠️ CROSS-MODULE files — RECONCILE before committing (you also edit these)
Each portal edit is flagged with an inline comment; merge with your concurrent work:
- `server/lib/financeCCRoutes.mjs` — void→portal hook calls; dispute endpoint; records filing on variation send + claim issue (`fileJobRecord(... exposeToPortal:true)`); imports from `portalIntegration` + `jobRecordsFiler`.
- `server/lib/authRoutes.mjs` — accept-invite sets `portal_enabled`/`portal_v2_enabled` + handles link error; invite validates client+projectId; **repeat-client** branch links an existing client to a 2nd project.
- `server/lib/module4Routes.mjs` — win-finalize stamps `portal_client_name`/`email` from the job.
- `server/lib/siteDiaryRoutes.mjs` — diary save → `syncDiaryToPortalUpdate`; PDF repointed to `fileJobRecord`.

### 🚫 DO NOT COMMIT
- `_tmp_burst.mjs` — stray scratch file (not part of this work).
- `docs/WORKFORCE_DEPLOY_HANDOFF_2026-06-22.md` — belongs to the concurrent workforce work, not the portal (commit with that work, not here).

---

## Honest state
Adversarial cohesion audits ran 5×: **34 → 48 → 58 → 52** (it's non-deterministic and caps heavily for migrations it can't confirm from code; its #1 blocker every round was "apply the migrations" — now done). The **lanes climbed to 6–8**, the audit calls the **security/data-leak posture "launch-grade,"** and the finance integration is proven (27/27). This is a **defensible MVP for a hand-picked first client with hand-holding** — the NO-GO is against a deliberately brutal "every lane fully end-to-end" bar.

## Remaining (tracked, non-blocking)
- A real photo **upload** pipeline (the admin Photos UI tags existing `project_photos`, doesn't upload).
- Records-filing producer rollout `#33` (induction/WHS/schedule/invoice/PO → `fileJobRecord` — mechanical, doesn't affect portal cohesion).
- Post-handover `practical_completion → past_client` CRM flow (Phase 2).

## Pre-commit checklist
- [ ] Reconcile the 4 cross-module files with your concurrent edits.
- [ ] Exclude `_tmp_burst.mjs`; route the workforce handoff doc to its own commit.
- [ ] Confirm migrations 108 + 110 are applied to prod (they are, per Sam + `verify_migrations`).
- [ ] `npm run build` + `node scripts/real_data_dryrun.mjs` (27/27) as a final gate.
- [ ] Deploy → the live site will then route clients to `/client-portal` (today only localhost has the new code).

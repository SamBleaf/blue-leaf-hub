# R02 Master Register — Implementation Touchpoint Map

**Branch:** `master-register-r02`  ·  **Base commit:** `97f1068` (current shipped tip — "HUB 029/030 live (main 7f83954)"; migs through 211; local `main` ref is 479 commits stale)  ·  **Date:** 2026-11-06
**Contract:** Tab 19 — R02 Build Execution. **Authoritative workflow:** Tab 18.
**Rule:** feature-branch only. No production deploy, no live-customer data, no client messages/invites, no test PDFs to clients. Any new migration is additive + reversible + explicitly tested.

---

## Phase 0 — pre-flight: what the REAL repo says (verified, not from stale docs)

| Claim in the audit / Tab 18 | Verified in repo? | Concrete finding |
|---|---|---|
| Stages `enquiry→qualify→discovery→winning_offer→fee_proposal→consultants→tender→won` | ✅ | `LEAD_STAGE_ORDER` in `src/lib/constants.js`; no `contract` stage; `won` gated by signed PTSA + staff approval. |
| Concept Meeting / Presentation = `lead_meetings` activities in `winning_offer` | ✅ | `MEETING_TYPES` = `designer_meeting` (Concept Meeting), `winning_offer_presentation` (Concept Presentation). Tables: mig `185_lead_meetings`, `189_meeting_structured_notes`. |
| `leads.selections_schedule` JSONB = pre-job scratchpad | ✅ | Added mig `188_concept_stage`, `jsonb NOT NULL DEFAULT '[]'`. **Current item shape is thin:** `{area, item, notes}` only (see `ConceptStage.jsx:40`). |
| `client_selections` / `selection_options` = canonical project-keyed selection store | ✅ (schema) / ⚠️ (live) | Created mig `103_client_portal_v2`. **NOT VERIFIED on live DB** — mig 103 header requires 099–102 applied first; memory/live state says 103 "awaits paste". Treat as unverified → build + test on a disposable dev DB. |
| `convertLeadToJob` is idempotent | ✅ | `salesRoutes.mjs:319`. Returns existing job if `lead.job_id` set; dedups by normalised address; stamps facts via `setFact`; links CRM + referral. **Does NOT promote `selections_schedule` today.** |
| lead → job → project path | ✅ (with nuance) | `convertLeadToJob` makes a **job** (at PTSA-signed). A **project** row exists only later: preconstruction project created at `salesRoutes.mjs:1125` (`is_preconstruction=true`), or at win via trigger `096_auto_project_on_win`. `client_selections.project_id → projects(id)`, so **promotion into client_selections can only happen once a project exists (preconstruction/win), not at the job step.** |
| factsService holds scalar job facts | ✅ | `factsService.mjs` / `jobFactRegistry.mjs` live; `setFact`/`getJobProfile` consumed across modules. |
| Existing document engine (docTemplates/salesDocuments) | ✅ | `salesDocuments.mjs` (`renderSalesDoc(sb, docType, lead, ctx)`) → `docTemplates.renderDocxTemplate` (text-only docxtemplater). `SALES_DOC_TYPES` map. **No second engine — reuse this.** |
| Existing PDF/plan viewer available | ✅ | `src/components/takeoff/PdfViewport.jsx` + `usePlanDocument.js`. MVP per contract = link/open drawing in adjacent tab; reuse viewer only if cheap. |
| Stage UI components | ✅ | `src/pages/LeadDetail.jsx`; `src/components/sales/lead-detail/`: `LeadCommandCentreLayout`, `LeadNextActionCard`, `LeadStageStepper`, `ConceptStage`, `ConsultantsStage`, `TenderStage`, `LeadDetailHeader`. |
| Safe existing lead write route | ✅ | `PATCH /api/sales/leads/:id` (`salesRoutes.mjs:1493`, requireAuth). Writes passed columns incl. `selections_schedule`. (`ptsa_status=signed` / `concept_agreement_status=accepted` are blocked — routed through their own side-effecting endpoints.) |

**⭐ Load-bearing finding (the scope-vs-selection guard):** inserting a `client_selections` row is **client-facing**. The portal admin "create selection" route (`portalV2AdminRoutes.mjs:156`) also inserts a `client_actions` row (`action_type:'selection_decision'`, "Select …") that surfaces in the client's **My Actions**, and the client portal reads `client_selections` directly. **Therefore scope/work records (demolish / retain / make-good / by-others / excluded) must NEVER be written into `client_selections`** or they become client approval tasks. Promotion must write ONLY genuine product/finish selections into `client_selections`, and never auto-create a `client_action` (promotion ≠ inviting the client).

---

## Minimal change set (reuse first, add least)

**Reuse as-is:** stages + gates, `lead_meetings`, `PATCH /api/sales/leads/:id`, `convertLeadToJob`, preconstruction-project creation, `client_selections`/`selection_options`, `factsService`, `salesDocuments.renderSalesDoc` + `docTemplates`, `takeoff/PdfViewport`, existing LeadDetail/ConceptStage/ConsultantsStage/TenderStage shells, `client_actions` (untouched).

**Pre-job (NO migration):** enrich the `leads.selections_schedule` JSONB item shape in place (freeform jsonb) — backward-compatible with `{area,item,notes}`. New register item carries a **stable `id`**, `level`, `room`, `roomScope`, `kind` (`scope` | `selection`), `category`, `disposition` (New/Alter/Retain/Remove/MakeGood/ByOthers/Excluded/N-A/Undecided), `description`, optional `product/manufacturer/model/colour/dimensions`, `certainty` (NotConsidered/Preference/Proposed/ClientApproved), `responsibility`, `source` (sheet+rev / supplier doc / note), `nextAction`+`owner`, `isDefault`/`overridesDefaultId`. Plus a small `register_meta` block on the lead (plan rev, room list/order, last-room pointer for resume). Vocab → `src/lib/constants.js`.

**Canonical promotion (needs the ONE data decision below):** at preconstruction-project / win, promote ONCE (keyed by stable item `id` for idempotent retries):
- **selection-kind** items → `client_selections` (+ `selection_options`), internal status, **no `client_action`**.
- **scope-kind** items → must NOT go to `client_selections`.

---

## The ONE build decision to confirm (schema-committing)

**Where do room SCOPE/WORK records live once a project exists?** (They must never surface in the portal.)

- **Option A (recommended): one small, narrowly-named additive table** `room_scope_items` (project-keyed), scope/work only, with optional `linked_selection_id → client_selections(id)`, `source_ref` for idempotent promotion, and audit columns. + a few additive columns on `client_selections` (`source_ref`, `selection_certainty`) so selections keep their stable lead-item identity and certainty. Additive, reversible, no change to portal reads. Matches the contract's "ONE small scoped data extension for room work/scope with explicit relationship to selection IDs."
- **Option B:** store scope/work only in `factsService` / existing job scope fields; no new table. Smaller, but facts are scalar — a per-room, per-item scope list with history doesn't fit cleanly and risks bending the facts model.
- Both keep a **single writable choice source** in `client_selections`. Neither is a generic "master register" table.

---

## Live-deployment risks

1. **Mig 103 unverified on live** → `client_selections`/`selection_options` may not exist in prod. Promotion + canonical tests run on a **disposable dev DB** only; prod rollout is a separate authorised step.
2. **Project-row timing** — promotion must be wired to preconstruction/win project creation, not job creation. Guard against double-promotion on retry (idempotent by stable item `id`).
3. **Portal pollution** — scope rows must never reach `client_selections` (guard above). Regression required.
4. **No auto-invite / auto-send** — promotion and doc generation never create a `client_action`, portal invite, or email on stage change.

---

## Proposed increments (smallest first)

- **Increment 1 (NO migration, zero prod risk):** scratchpad register data model + constants; room-by-room walkthrough UI inside the existing Concept flow (Plan Setup → Whole House → Room Walkthrough → Outstanding → Documents); save/resume via the existing lead PATCH; whole-house defaults with per-room exception; office filterable list; drawing opens in adjacent tab. Wire the existing stage doc buttons to **draft** preview (Client Brief at Concept Presentation; Architect Brief + Selections at Consultants) from the same records via `renderSalesDoc`. Tests T01–T05, T07(draft), T15 on fictional projects A/B/C.
- **Increment 2 (ONE additive migration, dev DB):** `room_scope_items` + `client_selections` additive columns; promote-once in preconstruction/win; scope-vs-portal regression; idempotent retry. Tests T06, T08, T10, T13, T14.
- **Increment 3:** consultant Rev-B attach + manual reconcile; handover/portal onboarding integrity. Tests T09, T11, T12.

Stop boundary: Increment 1 is independent, non-destructive UI/fixture work. The migration (Increment 2) pauses for the data decision above + explicit authorisation before any prod apply.

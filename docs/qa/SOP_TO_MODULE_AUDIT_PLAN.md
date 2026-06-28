# SOP-to-Module Audit Plan

**Status:** 2026-06-28 · Governed by [COMPREHENSIVE_HARDENING_MASTER_PLAN.md](./COMPREHENSIVE_HARDENING_MASTER_PLAN.md).
**Run by:** SOP Alignment Auditor (no product code). **Output store:** [BUG_REGISTER.md](./BUG_REGISTER.md).

**Goal:** prove that every SOP describes what the app *actually* does, for the role that
actually does it — so "it works" also means "a staff member can run it from the SOP." Drift is a
deployability blocker, not a documentation nicety.

---

## 1. Method (per module / workflow)

For each SOP in `docs/sops/<NN_module>/`:

1. **Identify the SOP source** — the file under `docs/sops/`, its entry in
   `docs/sops/SOP_INDEX.md`, and its `test_status`.
2. **Write the expected employee script** — the plain-English numbered steps a real user follows
   (the SOP body should already read this way; if not, that's drift).
3. **Map the app surface** — the screens/routes/APIs the script touches, taken from
   [WORKFLOW_OWNERSHIP_MATRIX.md](./WORKFLOW_OWNERSHIP_MATRIX.md) (Screen → writes/reads, Route →
   owner file). Confirm each route/screen exists in the current tree.
4. **Compare expected vs actual** — walk the script against the real UI (read-only) and the
   ownership/route map. Note every mismatch: a button that moved, a field the SOP names that the
   screen doesn't have, a step that now needs a different role, a state the SOP never mentions.
5. **Log drift** to [BUG_REGISTER.md](./BUG_REGISTER.md) with the relevant `Type:` token and
   `blocks-deployability (y/n)`.
6. **Classify** each finding (see §2).
7. **Fix the SOP text** if the drift is "the doc is wrong" (SOPs are docs — in scope), update
   `SOP_INDEX.md` `test_status` and `SOP_CHANGELOG.md`. If the drift is "the app is wrong",
   **do not fix the app** — log it for the Fix Agent.

> SOPs must keep the 14-section template from `docs/sops/SOP_MAINTENANCE.md`; **Section 14
> (Troubleshoot Agent Test Script)** must hold at least TC-01…TC-05 + one feature-specific case.
> A Section-14 gap is itself a finding (`Type: SOP-DRIFT`).

---

## 2. Classification

| Class | Meaning | Action |
|---|---|---|
| **bug** | App behaves wrong / contradicts a correct SOP | Log normal bug (severity); Fix Agent later (approved ID). |
| **SOP-DRIFT** | App is right, SOP is stale/missing/incomplete | SOP Auditor fixes the SOP text + changelog. |
| **ACCEPTED-GAP** | Known divergence Sam has accepted | Mark `ACCEPTED-GAP`; **only Sam** may create/close this class. |
| **TRAINING-GAP** | App + SOP correct, but the step is non-obvious / needs training | Log `TRAINING-GAP`; note training action; not a code blocker. |

---

## 3. Coverage — SOP folders → owning workflow/module

`docs/sops/` (20 folders). Audit order follows the UI/test priority (most-used, highest-risk first):

| # | SOP folder | Module / workflow | Primary routes |
|---|---|---|---|
| 02 | `02_sales` | Sales / Lead / CRM (W01–W02) | `/sales/*` |
| 03 | `03_tendering` | Tender Board (W05) | `/tender-manager/*` |
| 04 | `04_rfq_engine` | RFQ Engine (W06–W08) | `/tender-manager/*`, RFQ routes |
| 05 | `05_operations` | Operations (W09–W13) | `/operations/*` |
| 06 | `06_scheduling` | Schedule (W12) | `/operations/*` schedule tabs |
| 07 | `07_site_diary` | Site diary / media (W13) | `/operations/*` |
| 08 | `08_whs` | WHS / induction / SWMS / incident (W14) | `/operations/*`, `/induct/:projectId` |
| 09 | `09_finance` | Finance (W16) | `/finance/*` |
| 10 | `10_workforce` | Workforce / timesheets (W15/W17) | `/workforce/*`, `/worker` |
| 11 | `11_client_portal` | Client Portal (W18) | portal routes |
| 12 | `12_admin_settings` | Admin / settings | Settings |
| 13 | `13_subcontractors` | Subcontractors | `/tender-manager/*` |
| 14 | `14_cost_intelligence` | Cost intelligence | `/tender-manager/*` |
| 15 | `15_carpentry` | Carpentry | carpentry routes |
| 16 | `16_procurement` | Procurement / PO (W10–W11) | `/operations/*` procurement |
| 17 | `17_crm_mailing_list` | CRM / mailing list (W22) | `/sales/*`, CRM routes |
| 18 | `18_marketing_agent` | Marketing agent (W19/W20) | `/marketing/*` — **PAUSED UNTIL MERGE** |
| 19 | `19_marketing_intelligence` | Marketing intelligence (W21) | `/marketing/*` — **PAUSED UNTIL MERGE** |
| 00/01 | `00_getting_started`, `01_global_navigation` | Onboarding / nav | global |

**Marketing SOP folders (18/19) are not audited until `marketing-run-a` merges** — see
[MARKETING_POST_MERGE_HARDENING_PLAN.md](./MARKETING_POST_MERGE_HARDENING_PLAN.md).

---

## 4. Required employee scripts (by role)

Each role gets an expected day-in-the-life script. The auditor walks each against the real app
and logs drift. These are the *expected* scripts — discrepancies become findings.

### 4.1 Director / Admin
1. Sign in → land on a clear admin home.
2. Review pipeline health (`/sales`) — stage counts, stalled leads.
3. Open Finance (`/finance`) — invoice inbox, approvals, Director Portfolio job view.
4. Check Operations (`/operations`) — global Gantt, at-risk projects.
5. Review role/security-sensitive areas (admin-only nav present; non-admin areas gated).
6. Approve/triage outstanding items.
*Surface:* `/sales`, `/finance`, `/operations`, admin nav, Settings.

### 4.2 Estimator
1. Sign in → open a lead in the tender stage (`/sales` → LeadDetail).
2. Build/import the estimate; confirm a real `jobs.address` + linked job (W04).
3. Create the RFQ package / scope (W06), send RFQs (W07), match quotes (W07/W08).
4. Compare quotes, accept a quote (W08).
5. Produce the fee proposal / PTSA (W03) and send.
*Surface:* `/sales`, `/tender-manager`, RFQ engine, Module 5 fee proposal.

### 4.3 Supervisor
1. Sign in → open an active project (`/operations`).
2. Review the schedule (Gantt/Sheet/Delays/Dep Map); raise an EOT if needed (W12).
3. File a site diary entry + media (W13).
4. Run/confirm a site induction (`/induct/:projectId`) and check WHS/SWMS (W14).
5. Assign worker tasks; review leading-hand QC (W17).
*Surface:* `/operations`, schedule tabs, site diary, `/induct/*`, `/workforce`.

### 4.4 Office / Admin
1. Sign in → process the Finance invoice inbox (`/finance`) — IMAP + drag-drop, approvals.
2. Maintain CRM contacts + mailing lists (`/sales` CRM, W22) — respecting unsubscribe suppression.
3. Update job/contact records; carry lead→job contact forward (H14/H15).
4. Generate POs where authorised (W11) — admin-gated.
*Surface:* `/finance`, CRM, `/tender-manager` procurement.

### 4.5 Worker (PWA)
1. Open `/worker` on a phone (survives iOS home-screen install).
2. Clock on / submit a timesheet (W15).
3. Check in to a task; mark task progress (W17).
4. Complete a site induction if prompted (W14).
*Surface:* `/worker` (mobile-first).

### 4.6 Client (Portal)
1. Receive a magic-link invite (issued only for a real, active job — pilot gate).
2. Sign in to the portal; see only their own job (client isolation — W18).
3. View schedule/progress/photos as published (draft hidden).
4. Approve a variation / EOT; raise a question (W18 actions).
*Surface:* client portal routes. **Access verification is a deploy-gate item.**

### 4.7 Marketing / Admin user
1. Sign in (admin) → Marketing Command Centre (`/marketing`).
2. Plan the week (`/marketing/planner`); create content (`/marketing/studio`).
3. Move content through approval (`/marketing/approval`); schedule (`/marketing/calendar`).
4. Confirm **manual** publish boundary — nothing auto-posts.
*Surface:* `/marketing/*`. **DEFERRED — audited in the Marketing post-merge wave only.**

---

## 5. Output per audited module

- BUG_REGISTER entries (classified, with `blocks-deployability`).
- SOP text fixes + `SOP_INDEX.md` `test_status` + `SOP_CHANGELOG.md` entry.
- A line in the wave result doc: module · SOP coverage (yes/partial/none) · §14 present (y/n) ·
  drift count by class.
- The deploy gate requires **SOP drift fixed or accepted** for every module a staff role touches
  in the lead→handover journey.

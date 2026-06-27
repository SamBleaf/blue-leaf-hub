# Blue Leaf Hub — Go-Live Roadmap

**Created:** 2026-06-27 · **Owner:** Sam (decisions) + Claude/Cursor (execution)
**Purpose:** Single drivable plan from "hardened codebase" → "Blue Leaf runs a real job on the Hub." Supersedes the tactical bug list as the steering doc.
**Related:** [30_DAY_HARDENING_TRACKER.md](./30_DAY_HARDENING_TRACKER.md) · [RELEASE_READINESS.md](./RELEASE_READINESS.md) · [E2E_CLAUDE_SECOND_PASS_BLH-E2E-CLAUDE-20260627-1139.md](./E2E_CLAUDE_SECOND_PASS_BLH-E2E-CLAUDE-20260627-1139.md)

---

## ✅ Decisions locked (2026-06-27)
1. **Sandbox — YES** (provision non-prod mail/Buildxact/Dropbox).
2. **Commit — coordinated stabilise + commit → staging.**
3. **W18 scope — internal-first**; client portal is a fast-follow pilot, **not** in production cut #1.
4. **P1-W18-04 — C (SOP + monitor** the legacy token; no hard code change required now).

### What I need from you (unblocks me)
- **Sandbox creds** — set a `.env.sandbox` and start the API against it. Minimum viable sandbox (safe, gets the journey green now):
  - **Mail:** point `RESEND_API_KEY` at a Resend *test* key, **or** `SMTP_HOST/USER/PASS/FROM` at a sink (Mailtrap/Ethereal). Emails land in the sink, never real suppliers.
  - **Buildxact:** leave `BUILDEXACT_*` **empty** → the code guards on `buildexactConfigured` and no-ops (no real sync). (Tier-2 later: a real BX *test tenant* for full sign-off.)
  - **Dropbox:** leave `DROPBOX_*` **empty** (or point at a scratch team folder) → folder/file writes no-op gracefully. (This also sidesteps the win-finalize prod-Dropbox 502 I hit.)
- **Commit coordination** — tell me when the parallel agents (Cursor/other Claude) are **paused at a checkpoint**. The tree has ~190 untracked + ~48 modified files across agents; a clean commit needs a quiet moment so I don't capture their in-flight edits in shared files (financeRoutes, module4Routes, operationsRoutes, package.json, BUG_REGISTER…).

### What I'll do the moment each is ready
- **On sandbox up:** run the full external journey on the Norwood test job (RFQ send → match → accept → win-finalize → PO → PTSA DOCX/mark-signed → convert→folder) and report a true PASS/FAIL — flipping the conditional gates.
- **On agents paused:** stage + commit the verified hardening work on a branch, push, and stand up staging; then re-run `build` + `batch-a` on staging.

---

## Where we are (honest status)
The **engineering goal of hardening is essentially met**: two independent E2E passes + regression confirm the lead→tender→ops journey works, every security boundary holds, and there are **0 open Critical / 0 actionable High** defects. The blockers to production are **not more bug-fixing** — they are: (1) the integration seams have never been tested for real, (2) an undecided W18 scope, (3) a backlog of small Sam decisions, (4) SOPs/training, and (5) the whole tree is uncommitted.

**Confidence:** code = high · integration-under-real-conditions = unproven · people/process = not started.

---

## Phases (gates, owners, exit criteria)

### P0 — Stabilise & commit  ·  owner: Sam approves, Claude/Cursor execute
Get the verified work off the shared uncommitted tree before it entangles further.
- Land the accepted fixes (DISC-002 ✅, DISC-WIN-01 ✅, BLH-E2E-001 ✅ — all test-green) + BLH-E2E-CLAUDE-001 (Cursor, done).
- Coordinated **commit** of verified work; push to a branch; deploy to **staging** (not prod).
- **Exit:** working tree clean of verified hardening work; staging environment running the current build; `build` + `batch-a` green on staging.

### P1 — Sandbox & live-fire the integration seams  ·  owner: Sam provisions, Claude verifies
The #1 gap. Everything external has only been code-reviewed or hit prod.
- Provision **non-prod** test mail (Resend test key) + test Buildxact + test Dropbox (or sanctioned scratch areas).
- Live-fire end-to-end on the Norwood test job: RFQ **send** → quote match → accept → **win-finalize** → **PO issue** → PTSA DOCX/mark-signed → convert→job (Dropbox folder).
- **Exit:** the full external journey runs green against sandbox with zero prod side-effects → converts the second-pass "CONDITIONAL PASS" into a true PASS.
- *Note: win-finalize currently hits prod Dropbox synchronously and can 502/hang under rate-limit — this is precisely why a sandbox is required to test it (and a candidate robustness follow-up: make win-finalize's Dropbox writes best-effort/async).* 

### P2 — Clear the decision backlog  ·  owner: Sam
~7 open decisions are gating downstream work (see table below). A single decision session unblocks more than a week of execution.
- **Exit:** every row in the decision table marked decided in [SAM_DECISION_LOG.md](./SAM_DECISION_LOG.md).

### P3 — W18 UAT + SOPs/training  ·  owner: Sam/staff + Cursor (docs)
- Execute **W18-UAT-EXEC-01** (Client A/B isolation, magic-link login, draft→publish gating) + decide **P1-W18-04** (legacy token).
- Write the missing SOPs (PTSA-SOP-MISSING, SOP_INDEX/TEMPLATE_MASTER_AUDIT gaps) for the lead→handover journey.
- **Exit:** W18 UAT signed off; SOPs exist for every module a staff user touches in the journey.

### P4 — Supervised pilot job  ·  owner: Sam/staff
Run one real (or realistic) project through the Hub on staging, staff-driven, with Claude/Cursor on standby.
- **Exit:** a project goes lead→handover with no blocking issue → **GO decision**.

---

## Release gates (rolling)
| Surface | Now | Gate to GO |
|---|---|---|
| Staff internal (sales→tender→ops) | CONDITIONAL GO | P1 sandbox verify + P0 deploy |
| RFQ/tender | CONDITIONAL GO | P1 live send/match/accept |
| Tender win/ops handoff | CONDITIONAL GO | P1 live win-finalize (Dropbox sandbox) |
| Procurement/PO | GO (internal) | P1 live PO to sandbox Buildxact |
| Schedule/WHS/diary | GO (internal) | P3 SOPs |
| W18 pilot | **APPROVED WITH CONTROLS — ON HOLD** | Wait for signed contract + active Hub job; candidate: first building contract |
| W18 production | NO-GO | Legacy POST hardening (A for unsupervised) + SOP |
| Global production | NO-GO | all of the above + P4 pilot |
| W17 Workforce | owner-locked | (separate track) |

---

## Open decisions (P2 — Sam)
| ID | Question | Recommended default |
|----|----------|---------------------|
| **W18 scope** | Portal in production cut #1, or internal-first + portal pilot later? | **Internal-first**, portal as fast-follow pilot |
| **PORTAL-CROSSROLE** | Should employee/supervisor read a client's portal overview? | **Decided 2026-06-27** — admin yes; supervisor yes if project-related; employee no by default |
| **P1-W18-04** | Legacy token POST on non-v2 projects | **Decided** — C (SOP + monitor); pilot uses JWT only; **A** for unsupervised prod |
| **SAM-W01-004** | Mirror CRM interactions to lead timeline? | C — link only, no duplicate rows |
| **SAM-W05-001** | Tender Board aggregate rfqs vs packages | Document first; fix post-hardening |
| **SAM-W03-004** | Canonical PTSA signed-date field | A — `ptsa_signed_at` |
| **Sandbox** | Approve provisioning a non-prod mail/Buildxact/Dropbox env? | **Yes** — unblocks P1 |

---

## Fix-batch status (P0)
| Batch | Bug | Status |
|---|---|---|
| A | DISC-002 (HIGH finance accept lead-link) | ✅ shipped + **accepted closed** |
| B | DISC-WIN-01 (win-finalize cost_intelligence idempotency) | ✅ shipped + test-green — awaiting closure |
| C | BLH-E2E-001 (Ops Gantt `_DELETED` filter) | ✅ shipped + test-green (3/3) — awaiting closure |
| — | BLH-E2E-CLAUDE-001 (regression rotation race) | ✅ done (Cursor, test-only) |

---

## Top risks
1. **False "done" from green tests** — integration seams unproven until P1 sandbox. (Highest.)
2. **Uncommitted entanglement** — large shared tree across parallel agents; ship-cost rises daily until P0.
3. **W18 anonymous-POST surface** (P1-W18-04) — production NO-GO until decided.
4. **People layer** — without SOPs/training, "it works" ≠ "staff can run it."

---

## Next action
**Sam:** run the P2 decision session (table above) + approve P0 commit/deploy and P1 sandbox. Everything else flows from those two.

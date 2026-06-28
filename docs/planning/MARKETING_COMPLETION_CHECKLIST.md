# Marketing Command Centre — Completion, Pre-Merge & Hardening Checklist

**Doc ID:** MARKETING-COMPLETION-CHECKLIST
**Date:** 2026-06-28
**Branch:** `marketing-run-a` (isolated worktree `blh-marketing.nosync`)
**Scope:** The single tracking checklist for finishing the module, merging it safely, and hardening it for deploy. Supersedes scattered "remaining work" notes in the batch result docs.

Legend: ✅ done · ⏳ pending · ⛔ blocked / needs Sam

---

## 1. Completion checklist (build — on `marketing-run-a`)

| Item | State |
|---|---|
| Workflow spine complete: Plan → Create → Review → Approve → Schedule → Post/log → Measure → Reuse | ✅ |
| 10 routes mounted under `/marketing/*` + nav entries | ✅ |
| Legacy Studio preserved (`/marketing/studio/legacy`) | ✅ |
| Migration 122 applied to main + live schema verified (8/8, read-only) | ✅ |
| Demo / Empty / Live state vocabulary consistent (shared `MarketingStateBanner`) | ✅ |
| Demo never shown on a successful-but-empty response; never implies a save | ✅ |
| Module readiness panel (Command Centre) | ✅ |
| Field helper text (Vault filters, Planner template/slot/channel, Studio modes) | ✅ |
| Content Studio & package-review polish (numbered steps, audience/platform helpers, package summary, shared review legend, next-step copy) | ✅ |
| Review vocabulary consistent (shared `ReviewLegend` in Studio + Approval Queue) | ✅ |
| SOP suite 18-01..18-08 (14-section template) | ✅ (copy refresh optional) |
| Lint + build clean | ✅ |
| Legacy tab retirement (`/library`, `/campaigns`, `/media`, `/lists`) | ⏳ after runtime verify |
| Orphan cleanup (`ContentCreatorShell.jsx`, old-name SOP files) | ⏳ deferred |
| Runtime smoke (auth gate, UI render, write flows) | ⛔ staging / explicit approval |

---

## 2. Pre-merge checklist (before merging into main / portal-v2)

Do **not** merge until these pass. Main tree currently has an active redesign agent in `App.jsx` / `AppShell.jsx` — wait for it to settle.

- [ ] Main/portal-v2 working tree is clean (no unrelated in-flight work) or changes are committed
- [ ] Rebase/merge `marketing-run-a` onto current `main`/`portal-v2`; resolve conflicts in the known overlap files only:
  - [ ] `server/dev-api.mjs` (marketing route registration block)
  - [ ] `src/components/AppShell.jsx` (`MARKETING_MODULES` nav array)
  - [ ] `src/App.jsx` (`/marketing/*` mount)
- [ ] Confirm migration **122 is still the next free number** at merge time (portal-v2 was at 121; re-check no other branch claimed 122)
- [ ] W22 CRM commits (`crmRoutes.mjs`, `package.json`) — confirm no marketing-file overlap (none expected)
- [ ] Runtime smoke (§3 below) has passed on staging OR Sam explicitly approves a live post-merge smoke
- [ ] `npm run lint` + `npm run build` clean on the merged tree

---

## 3. Hardening checklist (pre-deploy — after merge)

Runtime smoke (deferred from every prior batch — gated on a safe environment):

- [ ] Boot against **staging** (or live with explicit approval) — **never** a blind full-boot against the live `.env` (it starts finance IMAP polling + portal sync; see verification result doc)
- [ ] Auth gate: `/marketing/*` 401 without token; admin-only (non-admin blocked, UI + API)
- [ ] Each of the 10 routes renders real data (no demo banner on live)
- [ ] Write flows: package send → Approval → Calendar schedule → Mark-as-posted (`publish_mode=manual`)
- [ ] Evergreen marking persists; Attribution reflects known + unknown source leads
- [ ] Legacy Studio generate/save still works (no regression)
- [ ] No external integration fires (no posting, email, Buildxact, Dropbox, Gmail)
- [ ] Run SOP **18-08** smoke checklist end-to-end + `scripts/marketing-smoke-check.mjs`
- [ ] Standard hardening pass (security review, error paths, RLS spot-check)

---

Next safe action: continue building / polishing on `marketing-run-a`; run §3 on staging when provisioned, then §2 to merge.

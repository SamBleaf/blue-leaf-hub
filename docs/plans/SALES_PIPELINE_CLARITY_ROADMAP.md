# Sales Pipeline — path to "fully built" (clarity roadmap)

Source: 8-agent stage-by-stage audit (2026-09-04) against the guided-control-panel bar
(one next action · to-advance checklist · compact asset cards · management strip).
Verdict: functionally ~complete; the gap is **path-forward clarity**. Clarity scores /5:
Enquiry+Qualify 3 · Discovery 2 · Concept 2 · PTSA 3 · Consultants 2 · Tender 2 · Won 3 · Spine 3.

## The ONE root cause (fix first — it fixes every stage at once)
The header's single **primary action is always the stage-ADVANCE/exit-gate button** ("Move to X →"),
never the current in-stage step. So the biggest button on the screen is either greyed-out (reads as
"I'm stuck") or a premature advance. That IS "no clear path forward / steps to take."
→ Make `primaryAction` **state-aware per stage** = the ONE incomplete thing to do now, with a
plain-English disabled reason (already done partially for tender/won). LeadDetail.jsx ~2644-2652 +
LeadDetailHeader.jsx.

## Foundation (cross-cutting — do as Phase 0, benefits all 8 stages)
1. **State-aware primary action** (above) — the backbone of the whole fix.
2. **Fill the empty Tender→Won gate** — GATE_REQUIREMENTS.won = [] today, so "Move to Won" is a
   one-click ungated finish. Add: contract signed + proposal presented (+ advisory: deposit, DA).
3. **Reconcile the email duplication I introduced** — StageEmailBox now duplicates the dedicated
   senders (qualify/discovery/concept brief+interim/PTSA accepted-concepts). Two buttons send the
   same email. Fix: StageEmailBox only lists templates with NO dedicated card (the gap emails +
   tender), and shows "use the panel above" for stages that own their sender.
4. **Gate rows = how to fix, not just what's missing** — add a one-line hint + click-to-focus per
   unmet gate row; surface a compact gate checklist next to the Do-this-now card (not just the rail).
5. **Focus-card hierarchy** — the step (focusContent) first, management strip below the actual step.
6. **Stop silent regressions** — clicking an active status pill toggles it OFF (Concept design steps;
   consultant deliverable pills wrap Issued→Pending). Clamp forward-only / confirm before un-setting.
7. **Persistent sent/seeded badges** — StageEmailButton + OpsScheduleHandoff track state in local
   useState only, so it resets on reload. Derive from correspondence / a lead field / task count.

## Section-by-section (the stages we'll work through)
- **Enquiry** — kill the 3 competing "advance" buttons; EnquiryCallScript owns Proceed/Nurture/Lost.
- **Qualify** — remove the duplicate qualify-email sender; primary = send email → check booking →
  advance; hide the "5+ required" amber during enquiry; fix the false-green booking tick.
- **Discovery** — surface Design-stage + Desired-start (the invisible advance blockers) IN the focus
  card; add a computed "next step" line; reorder cards chronologically; name the meeting consistently.
- **Concept** — one state-aware CTA (unlock→brief→interim→present→approve→fee→advance); remove the
  legacy "Winning Offer" block + the duplicate in-component email card; raise concept-fee invoice
  in-stage; make design steps forward-only.
- **PTSA/Plans** — remove the misplaced "Create Fee Proposal" CTA (2 stages early); number the 5-step
  path; add advisory rows (design fee invoiced / drawings uploaded / plan presented); make Working
  Drawings a real action with a count, not prose.
- **Consultants** — add the missing "Generate Fixed-Price proposal →" CTA (currently a dead-end gate
  item); make the in-stage "Ready for tender" checklist mirror the real gate exactly; reorder (roster
  first); clamp deliverable pills; bind "Final presentation" row to real state.
- **Tender** — evolve the primary action with progress (RFQ → book presentation → send contract);
  one contract source (retire the overlapping tracker); auto-derive sub-status from real signals;
  surface programme sign-off in the checklist.
- **Won** — make the Ops handoff the primary action (not "View job dashboard"); replace the 3
  celebratory banners with one handoff card mirroring advanceBlock; warn/block Mark-Ops-Ready when
  Development Approval isn't granted; persist seeded/notified; reorder (schedule → consent → checklist).

## Sequence
Phase 0 (foundation 1-7) → then stages in pipeline order. Each ships + deploys + is reviewed with Sam.

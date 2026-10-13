# R04 amendment — has the build met the brief?

Date: 14 October 2026 (Adelaide). Supplements the original R04 findings.
Review basis: supplied R03 source and evidence, independent checks listed in 00, and the owner's subsequent feedback. This is a correction contract, not a claim that corrections are already implemented.

## Overall verdict

Accept the technical foundation. Do not accept the feature as a finished onsite purchasing tool yet.

The intended product is a builder-friendly phone workflow: open a job plan, calibrate it, draw or reuse a flashing, take off lengths, and produce an accurate supplier order. The current build implements much of the machinery but misses the ease of drawing, robust recovery and trustworthy end-to-end ordering required by that brief.

Retain and improve the current architecture. Do not restart, redesign the whole Hub or expand this correction into timber/cladding implementation.

## Requirement-to-outcome matrix

| ID | Original requirement | Current assessment and evidence | Required change or verification | Acceptance |
|---|---|---|---|---|
| B01 | Fast phone drawing comparable in ease to Flash.it | Not achieved; owner feedback plus Apply forms and duplicated controls (F03). Exact Flash.it parity has not been independently established. | Contextual canvas editing; quiet default screen; rare transforms in More. | Complete A01 without hunting through end-treatment forms or repeated confirmations. |
| B02 | Easy crush folds | Not achieved in usability; buried Closed hem controls. | Endpoint → Crush fold; visible width and one-tap flip, available during drawing. Explicit hem topology retained. | Two taps insert; width edit auto-applies; fold represented correctly in PDF and indicative girth. |
| B03 | Direct dimension/angle/face edits with undo | Partial; information exists but changes require Apply. | Live valid edits, coalesced undo, safe draft input, stable focus and viewport. | A01/A02; no Apply, required Enter or intermediate Save. |
| B04 | Standard flashings reused and resized per job | Foundation implemented; persistence and isolation still need complete journey proof. | Preserve standard/job-copy separation, dimensions, face, end folds and new material attributes. | A03; job changes never silently update company standard or another job. |
| B05 | Save work reliably on a phone | Not achieved for unfinished drawing (F02). | Persist incomplete new/existing drawings, typed drafts and valid changes; accurate sync status. | A02: reload/offline recovery, no false Saved status. |
| B06 | Existing Supabase plans as takeoff source; select main plan and calibrate two axes | Substantial foundation, not independently phone-verified. | Verify entry from existing carpentry job plans, post-upload Scale plans action, main-page choice and per-page/revision calibration. Add precision loupe (F08). | A04; calibration/marks remain correct under zoom, rotation, reopen and plan revision. |
| B07 | Measured runs +200 mm total then rounded UP to 100 mm | Existing calculation tests support foundation. | Retain source vs finished distinction; show calculation clearly; no duplicate allowance. | A05 fixtures. |
| B08 | Manual/count pieces use finished length | Foundation; long-piece splitting omitted (F07). | No measured allowance added; extend explicit Split to manual/count, including partial quantity. | A05/A06. |
| B09 | 6 m handling threshold, keep whole and flag; 9 m configured ceiling | Partial. Threshold must not become an automatic split rule. | Keep whole, expose explicit split; correct laps/quantities; invalidate on source/rule/calibration changes even if rounding unchanged (F05). | A06; unorderable length cannot be released as order-ready. |
| B10 | Material, finish, thickness and colour, including perforated flashing | Incomplete catalogue and identity support (F04/F06). | Dependent dropdowns and complete validated data flow; unpainted no fake colour; preserve custom/legacy values. | A07; solid and perforated cannot merge; PDF specifies enough to order. |
| B11 | Basic accurate supplier order form | PDF foundation exists, but not acceptable for purchasing due to reproduced wrong-colour export (F01). | Enforce consistent current material identity; visibly stale draft lines; immutable historical exports. | A08, A09; every piece reconciles to source and printed specification. |
| B12 | Fit existing Hub desktop/PWA | Supplied visuals broadly align; usability/performance not independently established. | Reuse existing components/tokens, job context and permissions; readable phone controls and loading/error states. | A01/A04/A09 on actual phone and desktop; no clipped controls or blocked canvas. |
| B13 | Shared base for later timber/cladding/material rules | Architecture direction sound; future workflows not built or validated. | Preserve generic internal schema/calculation interfaces. Use flashing-specific labels only in this workflow. | Code review shows future adapters can use same plans, calibration, measurements and orders without duplicating them. |
| B14 | Future operations/procurement/supplier integration | Future integration intent, not evidence of a completed operations plan-upload or procurement module. | Preserve integration points and existing supplier/job metadata reuse. Document remaining future work honestly. | No invented supplier/delivery values; export and order placement remain distinct. No requirement to build the whole future module in R04. |

## Priority and boundary

1. Correct F01 and specification identity first: a usable editor is insufficient if it can issue the wrong order.
2. Implement F02/F03/B01–B05 together: autosave, undo and draft recovery must share one coherent lifecycle.
3. Complete material model and order output together, then split/loupe/plan integration gaps.
4. Run full workflows and reconcile outputs. Fix failures before packaging.

Must preserve: existing auth separation, job permissions, feature flag, immutable exports, existing plan storage, correct calculation rules, generic material architecture and current unrelated Hub work.

Out of scope for this correction: full timber/cladding estimators, automated structural member sizing, new operations plan-upload module, full procurement automation, general CAD, automatic plan interpretation and automatic cut optimisation. Record them as future work, not failed R04 deliverables.

## Evidence and honesty

149 independent unit tests, lint and build passed during this review. Database/handler tests were skipped here; browser setup failed and no fresh physical-phone test ran. Existing builder screenshots/logs are supporting evidence, not independent proof of phone usability.

Do not assign a percentage-complete claim or use a green unit suite as product acceptance. Report each B/A item as PASS, FAIL, or NOT VERIFIED with an evidence pointer. NOT VERIFIED is not PASS.

This amendment adds the overall product judgement missing from the earlier bug-focused handoff. Detailed implementation requirements in 00–02 remain in force.


# Master Register R04 — browser verification (observed outcomes)

Interactive checks I ran in a real browser against the isolated staging, **separate from the unit/API tests**.
Build verified: staging SPA `main-CKkG2sk-` (the build carrying all R04 fixes incl. review §1). Signed in as
the sandbox staff admin on lead **Daniel & Priya Henderson** (P1, renovation/extension). Dates 2026-11-08/09.

> Scope honesty: this is a single-operator staff walkthrough. It is **not** a completed two-party client/staff
> pilot. The flows that need a second (client) session or forced-failure injection are listed under "Not yet
> browser-verified" and remain for the independent human/ChatGPT pilot — that is what the staging exists for.

## Observed in the browser (pass)
| # | Check | What I saw |
|---|---|---|
| B1 | **Slice 5 — Kitchen** guided room | Scope led with K-001 "New kitchen or retrofit?"; the generic prompt sat under a collapsed "▸ Explore more 1"; K-002/K-003 led Layout. |
| B2 | **Slice 5 — Bathroom** guided room | Scope led with B-001 "Retain, renovate or new?"; generic prompt under "▸ Explore more 1"; "Layout & function" below. Confirms the guided view is not the old dense questionnaire. |
| B3 | **Documents — issued revisions + supersession** | Preliminary Client Project Brief showed **P01→P04** with P04 **Current** and P01–P03 **Superseded**; Architect Design Brief P01 Current; Selections & Finishes Schedule P01. Each revision exposes **PDF** and **DOCX** actions. Superseded revisions remain listed and retrievable. |
| B4 | **Slice 2 — issued PDF open fires a real tab** | Clicking a revision's **PDF** caused the page to call `window.open` and navigate a new tab to the signed storage URL — the Browser pane blocked the *programmatic* tab-spawn (its automation rule, not an app fault), which itself proves the pre-reserved window is a **real handle**. Under the old `noopener` bug the handle would have been null and nothing would have tried to open. A real user click opens the PDF. |
| B5 | **Register loads behind the feature switch** | The register card, step tabs (Project / Whole house / Site & existing / Rooms / Register / Documents) and content render for this pilot lead; routing and save work. |

## Covered by executed automated tests (not re-done by hand)
| Area | Evidence |
|---|---|
| Slice 5 across **all** room families (kitchen/bathroom/bedroom/living/**alfresco/balcony/external**/generic/retained) — nothing dropped, generic superseded only when a room-specific prompt replaces it | `register-room-prompts` **33/33** |
| Review §1 — a stale/failed save **cannot issue** a controlled document | `register-issue-stale` **7/7** (preview→edit→stale issue refused `409 ISSUE_STALE`, no revision recorded; fresh preview clears it) |
| Slice 1 — release-readiness gate, client Accept vs Request-changes distinct, race guard | `register-selection-readiness` **23/23** |
| Slice 6 — five distinct handover states, invited derived from the real invitations flow, no auto-invite | `register-handover-status` **15/15** |
| Promotion, documents issue/supersede, portal issue, **client isolation** (staff-only routes, portal scoping) | `register-e2e` **70/70** |

## Not yet browser-verified (for the independent pilot — needs a client session or failure injection)
- **Client portal, signed in as the client:** only the deliberately-issued selections visible; Accept and
  Request-changes round trip; a missing-options selection cannot become an impossible client task; cross-client
  account isolation (sign in as a different client and confirm no leakage). *(API-level isolation is covered by
  register-e2e; the live client-session walkthrough is not.)*
- **Room Save & Next under a forced save failure** (the client-side `flushAll` guard): the pane cannot easily
  inject a 500/409 on the PUT; the guard is code-verified and the server half is proven by `register-issue-stale`,
  but the live "edit a locked item then try to issue" demonstration was not performed.
- **Architect-tender progression** end to end (new architect lead enters Tender; mig-216 corrects a stranded one).
- **Handover panel** rendered for a Won/baselined lead (the Concept-stage pilot lead does not exercise the full
  five-state panel live; the derivation is proven by `register-handover-status`).
- **Signed PDF/DOCX actually rendered** in a viewer — the open fires correctly (B4), but the pane blocks the
  spawned tab, so I did not visually read the rendered PDF in-browser this pass.

## Net
Everything I verified live passed, and the automated suites cover the dimensions a single staff session can't.
No new defect was observed in the browser. The items above are not failures — they are the parts of the pilot
that require an independent operator (a client session, forced-failure injection) and are the reason the
isolated staging is published for that walkthrough. Do not read this as "independently browser-tested in full".

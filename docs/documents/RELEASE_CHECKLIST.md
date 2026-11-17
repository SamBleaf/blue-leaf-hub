# Document suite: release checklist

16 November 2026. Everything here must be closed before any register document is issued to a client in production. None of it holds up the design of the next documents (owner, 16 Nov 2026). The design decisions and their background are in `CPB_FINAL_CANDIDATE.md`.

**Design status**
- **Client Project Brief:** template cpb-2.4 is the accepted working design foundation (owner and ChatGPT, 16 Nov 2026). No further general redesign.
- **Next, in order:** the Architect Design Brief (frozen baseline), the Technical Selections Schedule and Client Selections Presentation (pair 2, at checkpoint), then the PBSA / Tender Proposal.
- **No document is authorised for live client issue.**

## Release controls

| # | Control | Owner | State | What closes it |
|---|---|---|---|---|
| R1 | Lato on Railway | Claude, then Sam | Fix built on branch `release/lato-railway`, not deployed | A Railway staging or preview deploy renders one preview, and its embedded fonts are Lato only. Never set `DOCUMENT_FONT_CHECK=warn` for client issue |
| R2 | Project number convention | Sam | Open | Answers to the five questions in `PROJECT_NUMBER_DECISION.md`, then a small build (allocate, lock and carry forward) |
| R3 | Engineered-stone document policy | Sam, with the WHS adviser | Open | The option chosen in CPB_FINAL_CANDIDATE B1 (option 2 recommended), its exact wording confirmed by the WHS adviser, and B1b to B1d decided |
| R4 | Status word and approval evidence | Sam | Open | B2: "Client-approved" or "Client-confirmed"; whether an approval needs a reference |
| R5 | Decision references | Sam | Open | B3: keep the codes, or stored display numbers (D1, D2 …) |
| R6 | Stage labels and the agreement's name | Sam | Open | B4: confirm "Scope review" and "Plans review", the Enquiry and Qualify label, and the PTSA's real name in client documents |
| R7 | "What changed" on a revision | Sam | Open | B6: yes or no to a typed note at issue |
| R8 | Immutable issue on production | Sam | Built (migration 213) | `select tgname from pg_trigger where tgname = 'trg_lead_documents_issue_guard';` returns one row on production |
| R9 | Client-portal test failure (Operations projects list) | Claude | Fixed in its own session, not merged | Merged and re-run green on the sandbox |
| R10 | Final issue approval | Sam | Open, per document | Blue Leaf's written sign-off for each document's client issue, after R1 to R8 |
| R12 | Migration 220 (Client Selections Presentation as its own document) | Sam | Prepared, applied to the sandbox only | Applied after 218; `select pg_get_constraintdef(oid) from pg_constraint where conname = 'lead_documents_document_type_check';` lists client_presentation |
| R13 | Selections pair decisions | Sam | Open | `SELECTIONS_SPEC.md` §9: two documents (S1), images, option lists, codes on approved records, engineered stone on the technical schedule, one record per product |
| R11 | Design freeze | Claude, after R10 | Not started | Pin the design tokens in `scripts/documents/design-system.mjs` with a test; later documents import it and never copy it |

Not a document control, but due before 30 November 2026: the Hub's shared `CLAUDE_MODEL=claude-sonnet-4-5` retires that day. The migration is a separate task. Blueprint and Check wording already fall back to Haiku 4.5 if their model is refused. Setting `BLUEPRINT_MODEL=claude-sonnet-5-5` in Railway moves Blueprint off Sonnet 4.5 now.

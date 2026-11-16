# AI models on Railway — owner steps (Nov 2026)

**Deadline: before 30 November 2026.** Anthropic retires `claude-sonnet-4-5` on 2026-11-30. Railway and the local `.env` both set `CLAUDE_MODEL=claude-sonnet-4-5`, and most Hub AI features read it, so from that day they would fail.

Branch `ai-models-migration` moves every AI call onto its own **task** in `server/lib/aiModels.mjs`. Each task has a default model chosen for the job and its cost, its own env override, and a fallback model. Nothing reads `CLAUDE_MODEL` any more.

Nothing here is deployed yet. The branch is committed locally only.

---

## 1. Check the API key reaches the new models (2 minutes, Anthropic Console)

The Nov 2026 Blueprint handover found that the production `ANTHROPIC_API_KEY` could call Haiku 4.5 but not the Sonnet models. If that is still true, every Sonnet task below will work, but each one will fall back to Haiku 4.5 on every call: the answers still come back, at lower quality, on transcripts, tender extraction, schedules and marketing copy.

1. Open the Anthropic Console → **Settings → Workspaces**, and open the workspace the production key belongs to.
2. Check that the workspace isn't limited to certain models. If it is, allow **claude-sonnet-5-5** and **claude-haiku-5-5**, and keep **claude-haiku-4-5-20251001** (the fallback).
3. If you can't tell, the check in step 4 shows it within a minute of the deploy.

## 2. Railway variables (API service → Variables)

| Variable | Action | Why |
|---|---|---|
| `CLAUDE_MODEL` | **Delete** | No longer read. While it is set, `/api/blueprint/health` shows a warning. |
| `MODEL` | Delete if present | The schedule code used to read it as a second choice. No longer read. |
| `BLUEPRINT_MODEL`, `BLUEPRINT_REVIEW_MODEL`, `DOC_PROOFREAD_MODEL` | Delete if present, unless you chose the value on purpose | These still override their tasks. The defaults are right. Any value starting `claude-sonnet-4-5` stops working on 30 Nov. |
| `AI_FALLBACK_MODEL` | Leave unset | The default `claude-haiku-4-5-20251001` is the model production is known to reach. |
| `FINANCE_AI_JOB_MATCH` | Leave unset for now | Turns on the finance AI job match (section 7). Off means invoices behave exactly as they do today. |
| `ANTHROPIC_API_KEY` | No change | |

There is nothing to add: the defaults are in the code. To change one feature later, set `AI_MODEL_<TASK>` (and `AI_EFFORT_<TASK>`: low, medium or high) from the table in section 6, then redeploy.

Do the same in your local `.env`: delete `CLAUDE_MODEL`.

## 3. Deploy

Merge `ai-models-migration` into `main` when you're happy with it, then let Railway deploy. The branch starts from `origin/main` at 95aeaa0 (the Blueprint model fix).

## 4. Check it worked (about 10 minutes)

**a. Health pages** (no login needed):

- `https://<railway-host>/api/health` → `models` lists 29 tasks, each `claude-sonnet-5-5` or `claude-haiku-5-5`.
- `https://<railway-host>/api/blueprint/health` → under `ai`:
  - `warnings` is empty (it names a leftover `CLAUDE_MODEL`, or any task still set to `claude-sonnet-4-5`);
  - `skipped` is empty, and so is `recentFallbacks`;
  - for each task, `using` equals `primary`. If `using` is the fallback, the key was refused that model (step 1).

**b. One action per module.** Do the ones you use. Each should work as before:

| In the Hub | Task | `ai_call_log.module` |
|---|---|---|
| Blueprint: send a chat message | `blueprint_chat` | `blueprintRoutes` |
| Blueprint: attach a PDF proposal and ask for a review | `blueprint_document_review` | `blueprintDocumentReview` |
| Sales lead → Conversations → Analyse with Blueprint | `sales_transcript` | `salesRoutes` |
| RFQ Engine step 1: extract a tender PDF | `rfq_tender_extract` | `devApi` |
| Subcontractors → Add → AI lookup | `subcontractor_lookup` | `devApi` |
| Fee proposal: import a Buildxact PDF | `fee_proposal_parse` | `module5Routes` |
| Schedule: Generate | `schedule_generate` | `scheduleClaudePlan` |
| Site diary: Structure with AI | `site_diary_structure` | `siteDiaryRoutes` |
| Finance: upload an invoice | `invoice_extract` | `financeRoutes` |
| Marketing: Generate content, and analyse a photo | `marketing_content`, `marketing_vision` | `marketingRoutes` |
| Marketing Intelligence: Generate brief | `marketing_seo_brief` | `marketingIntelligence` |
| Procurement: AI supplier email draft | `procurement_draft` | `procurementAi` |

**c. The log** (Supabase → SQL editor):

```sql
select called_at, module, model, input_tokens, output_tokens, round(cost_usd::numeric, 4) as cost_usd
from ai_call_log
where called_at > now() - interval '1 hour'
order by called_at desc;
```

Expected: a row for each action, `model` is `claude-sonnet-5-5` or `claude-haiku-5-5`, and no `claude-sonnet-4-5` rows. A `claude-haiku-4-5-20251001` row means the fallback answered. Railway's logs then show a line starting `[ai] <task>: model … refused` (the key can't use it) or `… declined the request` (the model refused that one request). Settings → AI usage shows the same rows by module and model.

**d. After 30 November**, once:

```sql
select model, count(*) from ai_call_log where called_at >= '2026-11-30' group by model order by 2 desc;
```

There should be no `claude-sonnet-4-5` rows.

## 5. If something goes wrong

- **One feature:** set `AI_MODEL_<TASK>` to a model the key reaches (for example `claude-haiku-4-5-20251001`) and redeploy. Never `claude-sonnet-4-5`.
- **Most of the Hub, before 30 Nov, without this branch:** on the old code, set `CLAUDE_MODEL=claude-sonnet-4-6` on Railway, if the key can reach it. The old code sends `temperature` and reads the first content block, and Sonnet 4.6 accepts both. **It doesn't cover everything:** Content Studio generation, campaign preload and drone-frame analysis hard-code `claude-sonnet-4-5` in the old code (`marketingAgent.mjs`, `marketingRoutes.mjs`, `marketingMedia.mjs`) and still stop on 30 Nov. That buys time only: it is not the fix.
- **`FINANCE_AI_JOB_MATCH`:** leave it unset. Before it is turned on, the AI job match needs two changes: its candidates must be active jobs ranked by address (today any 30 jobs), and it must run after the carpentry-job and overhead routing on the email-inbox path (today it can override them).

## 6. The tasks

Defaults: **Haiku 5.5** ($0.10 / $0.50 per million input / output tokens) for extraction, classification and short internal text; **Sonnet 5.5** ($2 / $10) for reasoning and for writing that leaves the business. Effort "low" (less thinking, smaller bill) except the nightly cost-insights cron, which compares numbers ("medium"). Fallback for all: `claude-haiku-4-5-20251001` ($1 / $5).

| Task | Used for | Default | Override | Was |
|---|---|---|---|---|
| `blueprint_chat` | Blueprint chat with Hub tools | Sonnet 5.5 | `AI_MODEL_BLUEPRINT_CHAT` or `BLUEPRINT_MODEL` | `BLUEPRINT_MODEL` → `CLAUDE_MODEL` |
| `blueprint_utility` | Blueprint knowledge formatting, SOP drafts | Sonnet 5.5 | `AI_MODEL_BLUEPRINT_UTILITY` or `BLUEPRINT_MODEL` | same |
| `blueprint_document_review` | QC of an attached proposal against the APB standard | Sonnet 5.5 | `AI_MODEL_BLUEPRINT_DOCUMENT_REVIEW` or `BLUEPRINT_REVIEW_MODEL` | Haiku 4.5, sent directly, not logged |
| `document_proofread` | Check wording on a document preview | Haiku 5.5 | `AI_MODEL_DOCUMENT_PROOFREAD` or `DOC_PROOFREAD_MODEL` | unchanged |
| `sales_transcript` | Meeting transcript → lead updates | Sonnet 5.5 | `AI_MODEL_SALES_TRANSCRIPT` | `CLAUDE_MODEL` (Sonnet 4.5) |
| `rfq_tender_extract` | Tender PDF → trade scopes | Sonnet 5.5 | `AI_MODEL_RFQ_TENDER_EXTRACT` | `CLAUDE_MODEL` |
| `quote_pdf_extract` | Totals from a subcontractor quote PDF | Haiku 5.5 | `AI_MODEL_QUOTE_PDF_EXTRACT` | Haiku 4.5 |
| `subcontractor_lookup` | Web-search a subcontractor's details | Sonnet 5.5 | `AI_MODEL_SUBCONTRACTOR_LOOKUP` | `CLAUDE_MODEL` |
| `tender_email_draft` | Follow-up email to a subcontractor | Sonnet 5.5 | `AI_MODEL_TENDER_EMAIL_DRAFT` | `CLAUDE_MODEL` |
| `fee_proposal_parse` | Buildxact estimate PDF → categories | Sonnet 5.5 | `AI_MODEL_FEE_PROPOSAL_PARSE` | `CLAUDE_MODEL` |
| `schedule_generate` | Build programme from estimate categories | Sonnet 5.5 | `AI_MODEL_SCHEDULE_GENERATE` | `CLAUDE_MODEL` |
| `schedule_analysis` | Critical path / sequencing analysis | Sonnet 5.5 | `AI_MODEL_SCHEDULE_ANALYSIS` | `CLAUDE_MODEL` |
| `schedule_task_advice` | Short tips for one task | Haiku 5.5 | `AI_MODEL_SCHEDULE_TASK_ADVICE` | `CLAUDE_MODEL` |
| `site_diary_structure` | Diary transcript → structured entry | Haiku 5.5 | `AI_MODEL_SITE_DIARY_STRUCTURE` | `CLAUDE_MODEL` (default Haiku 4.5) |
| `supervisor_voice` | Supervisor voice memo → diary / task updates | Haiku 5.5 | `AI_MODEL_SUPERVISOR_VOICE` | Haiku 4.5 |
| `voice_tasks` | Walk-through transcript → draft tasks | Haiku 5.5 | `AI_MODEL_VOICE_TASKS` | Haiku 4.5 |
| `cost_plan_metrics` | Floor areas and features from a plan PDF | Sonnet 5.5 | `AI_MODEL_COST_PLAN_METRICS` | `CLAUDE_MODEL` |
| `cost_insights` | Nightly cost-insights cron (effort medium) | Haiku 5.5 | `AI_MODEL_COST_INSIGHTS` | `CLAUDE_MODEL` |
| `project_insight` | Text of a project threshold alert | Haiku 5.5 | `AI_MODEL_PROJECT_INSIGHT` | Haiku 4.5 |
| `invoice_extract` | Invoice / receipt OCR, one call each | Haiku 5.5 | `AI_MODEL_INVOICE_EXTRACT` | Haiku 4.5 |
| `invoice_classify` | Trade category; AI job match (off unless `FINANCE_AI_JOB_MATCH=1`) | Haiku 5.5 | `AI_MODEL_INVOICE_CLASSIFY` | Haiku 4.5; the job match never ran (see below) |
| `procurement_draft` | Supplier quote / order email draft | Sonnet 5.5 | `AI_MODEL_PROCUREMENT_DRAFT` | `CLAUDE_MODEL` |
| `procurement_summary` | Reply summary, reminders, digest, delay note | Haiku 5.5 | `AI_MODEL_PROCUREMENT_SUMMARY` | Haiku 4.5 |
| `marketing_content` | Content Studio copy, autofill, video captions | Sonnet 5.5 | `AI_MODEL_MARKETING_CONTENT` | Sonnet 4.5 (hard-coded) / Sonnet 4.6 |
| `marketing_vision` | Photo and drone-frame analysis | Sonnet 5.5 | `AI_MODEL_MARKETING_VISION` | `CLAUDE_MODEL` / Sonnet 4.5 |
| `marketing_seo_brief` | SEO brief for a website page | Sonnet 5.5 | `AI_MODEL_MARKETING_SEO_BRIEF` | Sonnet 4.6 |
| `marketing_insights` | Weekly summary, question scan, suggestions | Haiku 5.5 | `AI_MODEL_MARKETING_INSIGHTS` | Haiku 4.5; the weekly summary never ran (see below) |
| `marketing_photo_sort` | Sort an inbox photo into a category | Haiku 5.5 | `AI_MODEL_MARKETING_PHOTO_SORT` | Haiku 4.5 |
| `marketing_frame_score` | Score video frames for clips | Haiku 5.5 | `AI_MODEL_MARKETING_FRAME_SCORE` | Haiku 4.5 |

## 7. What else changed, and why

Code changes required by the new models (each would be a 400 error or a broken reply):

- **No `temperature` reaches the new models.** Sonnet 5.5 and Haiku 5.5 reject it, so `adaptParams` removes it for them. The calls keep their old values (0 to 0.2 for extraction, 0.7 for marketing copy) so the fallback model, Haiku 4.5, behaves as it did before.
- **Replies are read by block type.** These models think before answering, so a reply can start with a thinking block. Code that read `content[0].text` would get an empty string, so every call now uses `replyText()`.
- **More room in `max_tokens`.** Thinking counts toward the limit. Caps as low as 64 tokens were raised to at least 1,024, so a short think can't use up the answer; tender extraction went to 20,000 and the Blueprint review to 8,000.
- **No assistant prefill was found** in the Hub's calls, so nothing to replace. Forced tool choice only appears in Blueprint, which already converts it.

Behaviour changes to know about:

- **Declined requests get a second try.** If a model declines one request (a safety classifier), the same request goes once to the fallback model. The model is not skipped afterwards.
- **A refused model is skipped for 10 minutes:** for every task when the key can't use it (404 / 403), for that one task when the model refused the request's shape (400).
- **Finance AI job match: fixed, but left off.** When exact and fuzzy matching can't place an invoice, an AI tier is meant to suggest a job (`match_method: "ai"`, confidence 65 or more). It has never run: the code named an undefined `MODEL` constant and the error was silently caught. It now works, but only with `FINANCE_AI_JOB_MATCH=1`, so today's behaviour (the invoice lands as unmatched) doesn't change until you decide. When on, its confidence is capped at 90. Auto-approval (`FINANCE_AUTO_APPROVE_BELOW`) needs confidence 100, so an AI guess always waits for approval. It costs about a hundredth of a cent per document.
- **Marketing Intelligence weekly summary now appears.** It named `claude-haiku-20240307`, which isn't a model id, so the banner never showed.
- **Blueprint document review is logged** in `ai_call_log` (it called the API directly before).
- **`/api/health`** shows `models` (task → model) instead of a single `model`.

Cost: Sonnet 5.5 is cheaper per token than Sonnet 4.5 ($2 / $10 against $3 / $15), and Haiku 5.5 about a tenth of Haiku 4.5. Low effort keeps thinking short. Haiku 5.5 counts the same text as about 30% more tokens. Expect the monthly AI bill to fall. Settings → AI usage shows it.

Tests: `node scripts/tests/ai-models-migration.test.mjs` (source guard + each module's request through a fake client), `scripts/tests/ai-models.test.mjs`, `scripts/tests/document-proofread.test.mjs`. No live API calls were possible while building (no key in the sandbox), so step 4 is the first real call.

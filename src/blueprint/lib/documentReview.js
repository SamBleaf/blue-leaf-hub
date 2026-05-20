/**
 * Lightweight document QC for chat uploads — avoids full Blueprint agent + PDF binary.
 */

import { extractPdfTextFromBase64 } from './extractPdfText.js';
import { getRelevantContext } from '../agent/knowledgeBase.js';

const DEFAULT_REVIEW_MODEL =
  process.env.BLUEPRINT_REVIEW_MODEL?.trim() || 'claude-haiku-4-5-20251001';

const SLIM_QC_SYSTEM = `You are Blueprint — document QC for Blue Leaf Building (Adelaide residential builder).

Review the uploaded construction document (tender, proposal, or quote) against the APB Fixed Price Construction Proposal standard.

A winning APB proposal typically includes: professional cover, executive summary, company profile & credibility, testimonials, detailed scope, inclusions/exclusions, programme, fixed price & payment terms, warranties, contract terms, and clear acceptance/next steps.

Return markdown:
## Score: X/100
## Summary
(one short paragraph)
## Issues
(numbered list: **severity** — section — problem — recommended fix)
## Top 3 priority fixes
## Ready to send?
Yes / No — and why

Be direct and specific. Do not invent content not supported by the document. Do not output a full rewritten document unless the user explicitly asked for a rewrite.`;

function lastUserInstruction(messages) {
  const userMsgs = (messages || []).filter((m) => m?.role === 'user');
  const last = userMsgs[userMsgs.length - 1];
  if (!last) return 'Please review the uploaded document(s) against the APB proposal checklist.';
  const c = last.content;
  if (typeof c === 'string') return c.replace(/\n\nAttached:.*$/s, '').trim() || 'Please review the uploaded document(s).';
  return 'Please review the uploaded document(s).';
}

function capRag(rag, max = 3500) {
  if (!rag || rag.length <= max) return rag;
  return `${rag.slice(0, max)}\n\n[Knowledge context truncated.]`;
}

/**
 * @param {import('@anthropic-ai/sdk').Anthropic} anthropic
 */
export async function runAttachmentDocumentReview({
  anthropic,
  attachments,
  messages,
  jobContext,
  model = DEFAULT_REVIEW_MODEL,
  maxTokens = 4096,
}) {
  const docs = [];
  for (const att of attachments || []) {
    if (att?.kind === 'pdf') {
      const { text, pages, truncated } = await extractPdfTextFromBase64(att.dataBase64);
      docs.push({
        name: att.name || 'document.pdf',
        text,
        meta: `${pages} page(s)${truncated ? ', truncated' : ''}`,
      });
    } else if (att?.kind === 'text') {
      docs.push({
        name: att.name || 'document.txt',
        text: String(att.text || '').slice(0, 48_000),
        meta: 'text file',
      });
    }
  }

  if (!docs.length) {
    throw new Error('No supported attachments to review.');
  }

  const instruction = lastUserInstruction(messages);
  const ragQuery = `${instruction} APB fixed price construction proposal QC checklist`;
  const ragContext = capRag(await getRelevantContext(ragQuery, { limit: 3 }));

  let userBody = `${instruction}\n\n`;
  if (jobContext?.address || jobContext?.client_name) {
    userBody += `Job: ${jobContext.address || '—'} | Client: ${jobContext.client_name || '—'}\n\n`;
  }
  for (const doc of docs) {
    userBody += `━━━━━━━━ DOCUMENT: ${doc.name} (${doc.meta}) ━━━━━━━━\n${doc.text}\n━━━━━━━━ END DOCUMENT ━━━━━━━━\n\n`;
  }

  const system = ragContext
    ? `${SLIM_QC_SYSTEM}\n\n---\nRelevant APB knowledge:\n${ragContext}`
    : SLIM_QC_SYSTEM;

  const response = await anthropicWithRetry(anthropic, {
    model,
    max_tokens: maxTokens,
    temperature: 0.2,
    system,
    messages: [{ role: 'user', content: userBody }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  if (!text) throw new Error('Claude returned an empty review.');
  return text;
}

async function anthropicWithRetry(anthropic, params, maxRetries = 3) {
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await anthropic.messages.create(params);
    } catch (err) {
      lastErr = err;
      const msg = err?.message || '';
      const is429 = err?.status === 429 || /rate_limit/i.test(msg);
      if (!is429 || attempt >= maxRetries - 1) throw err;
      const retrySec = Number(err?.headers?.['retry-after']) || 20;
      await new Promise((r) => setTimeout(r, retrySec * 1000));
    }
  }
  throw lastErr;
}

export { DEFAULT_REVIEW_MODEL, SLIM_QC_SYSTEM };

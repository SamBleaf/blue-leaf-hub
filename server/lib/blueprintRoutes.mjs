import { aiClient, modelsFor, createForTask, streamForTask, aiModelStatus, classifyAiError, AI_ERROR_TEXT } from "./aiModels.mjs";
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { config as dotenvConfig } from 'dotenv';
import fs, { existsSync } from 'fs';
import { join } from 'path';
import { runBlueprintAgent, BLUEPRINT_AGENT_VERSION, getHubStatus, buildChatSystemPrompt, trimChatHistory, MAX_HISTORY } from '../../src/blueprint/agent/runAgent.js';
import { requireAuth, requireRole } from './requireAuth.mjs';
import { courseNameFromMarkdown } from '../../src/blueprint/lib/knowledgeChunking.js';
import { indexLearnedKnowledge } from '../../src/blueprint/lib/knowledgeIndex.js';
import { runAttachmentDocumentReview } from '../../src/blueprint/lib/documentReview.js';
import { QC_REVIEW_SYSTEM_PROMPT, parseQCReviewJson } from './blueprintQc.js';
import { getServiceSupabase } from './supabaseService.mjs';
import { buildWinningOfferBlueprintAppend } from './salesRoutes.mjs';
import { getJobInsights } from './projectInsights.mjs';

const { parsed: _env = {} } = dotenvConfig();
const _apiKey = process.env.ANTHROPIC_API_KEY?.trim() || _env.ANTHROPIC_API_KEY?.trim();

// The model comes from the environment (BLUEPRINT_MODEL, then CLAUDE_MODEL), with a fallback model if it is refused for
// this key: server/lib/aiModels.mjs. A whitelist here used to override the environment and pin one model, so when the
// production key lost access to it Blueprint failed on every call and config couldn't recover it (Nov 2026).
const chatModel = () => modelsFor('blueprint_chat').primary;

const MAX_TOKENS = parseInt(_env.BLUEPRINT_MAX_TOKENS || process.env.BLUEPRINT_MAX_TOKENS || '8000');
const DEFAULT_KNOWLEDGE_DIR = existsSync(join(process.cwd(), '../blueprint-agent/src/blueprint/knowledge'))
  ? join(process.cwd(), '../blueprint-agent/src/blueprint/knowledge')
  : join(process.cwd(), 'src/blueprint/knowledge');
const KNOWLEDGE_DIR = process.env.BLUEPRINT_KNOWLEDGE_DIR?.trim() || DEFAULT_KNOWLEDGE_DIR;

let _anthropic;
function getAnthropic() {
  if (!_anthropic) {
    if (!_apiKey) throw new Error('ANTHROPIC_API_KEY not set in .env');
    _anthropic = aiClient();
  }
  return _anthropic;
}

/**
 * A provider failure as a status and a plain-English message. A model the key can't use is named as such: that cause
 * hid behind "Blueprint hit an unexpected error" for months (Nov 2026 handover).
 */
function friendlyAiError(err) {
  const kind = classifyAiError(err);
  if (kind === 'unknown' && /beta|anthropic-beta|not.*enabled|must include/i.test(err?.message || '')) {
    return { status: 503, friendly: 'Blueprint API feature flag error — a required beta header is missing. Check the server deployment.' };
  }
  const status = { rate_limit: 429, billing: 503, auth: 503, overloaded: 503, model: 503 }[kind] || 500;
  return { status, friendly: kind === 'unknown' ? 'Blueprint hit an unexpected error. Try again in a moment.' : AI_ERROR_TEXT[kind] };
}

async function callClaude(mode, messages, extras = {}) {
  const systemPromptAppend = await resolveWinningOfferAppend(extras.hubContext);
  const anthropic = getAnthropic();
  return runBlueprintAgent({
    anthropic,
    model: chatModel(),
    maxTokens: MAX_TOKENS,
    mode,
    messages,
    extras: { ...extras, systemPromptAppend },
    // Logged in ai_call_log, and retried once on the fallback model if this model is refused.
    callModel: (params, opts) => createForTask(anthropic, 'blueprint_chat', params, { module: 'blueprintRoutes' }, opts),
  });
}

async function resolveWinningOfferAppend(hubContext) {
  const leadId = hubContext?.leadId;
  if (!leadId || hubContext?.stage !== "winning_offer") return "";
  const sb = getServiceSupabase();
  if (!sb) return "";
  const { data: lead } = await sb.from("leads").select("*").eq("id", leadId).single();
  if (!lead || lead.stage !== "winning_offer") return "";
  return buildWinningOfferBlueprintAppend(lead);
}

const MAX_CHAT_ATTACHMENTS = 4;
const MAX_CHAT_ATTACHMENT_BYTES = 8 * 1024 * 1024;

function sanitizeMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));
}

function chatAttachmentToBlocks(attachment) {
  const name = String(attachment?.name || 'uploaded-document').trim();
  const size = Number(attachment?.size || 0);
  if (!name || !Number.isFinite(size) || size < 0 || size > MAX_CHAT_ATTACHMENT_BYTES) {
    throw new Error(`${name || 'Attachment'} is too large or invalid.`);
  }

  if (attachment?.kind === 'pdf') {
    const data = String(attachment?.dataBase64 || '').trim();
    if (!data) throw new Error(`${name}: missing PDF data.`);
    return [{
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data,
      },
      citations: { enabled: false },
    }];
  }

  if (attachment?.kind === 'text') {
    const text = String(attachment?.text || '').trim();
    if (!text) throw new Error(`${name}: text file is empty.`);
    return [{
      type: 'text',
      text: `\n\n━━━━━━━━ ATTACHED DOCUMENT: ${name} ━━━━━━━━\n${text.slice(0, 60000)}\n━━━━━━━━ END ATTACHED DOCUMENT ━━━━━━━━`,
    }];
  }

  throw new Error(`${name}: unsupported attachment type.`);
}

function attachDocumentsToLastUserMessage(messages, attachments) {
  const cleaned = sanitizeMessages(messages);
  const docs = Array.isArray(attachments) ? attachments.slice(0, MAX_CHAT_ATTACHMENTS) : [];
  if (!docs.length) return cleaned;

  const lastUserIndex = cleaned.map((m) => m.role).lastIndexOf('user');
  if (lastUserIndex === -1) return cleaned;

  const current = cleaned[lastUserIndex];
  const existingText =
    typeof current.content === 'string'
      ? current.content
      : Array.isArray(current.content)
        ? current.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
        : '';

  const blocks = docs.flatMap(chatAttachmentToBlocks);
  cleaned[lastUserIndex] = {
    role: 'user',
    content: [
      ...blocks.filter((b) => b.type === 'document'),
      { type: 'text', text: existingText || 'Please review the uploaded document(s).' },
      ...blocks.filter((b) => b.type === 'text'),
    ],
  };

  return cleaned;
}

const KNOWLEDGE_FORMAT_PROMPT = `
You are a knowledge base formatter for Blueprint — an AI Business Manager for Blue Leaf Hub trained on APB (Association of Professional Builders) content.

Take the raw content provided and format it into a structured Blueprint knowledge entry using EXACTLY this format:

## COURSE: [COURSE NAME IN CAPS]

### Core Concept
[2-3 sentence summary of what this course teaches and why it matters]

### Framework / Key Steps
[The main framework, process, or system taught — use numbered steps or named stages]

### Curriculum Structure
[List lesson titles/modules if present. If not present, write "Not specified in source content."]

### Key Principles
[5-7 bullet points of the most important rules, insights, or principles from this course]

### Blueprint SOP Trigger
*Use when: [comma-separated list of 5-8 questions or problems that should trigger this knowledge — written as if a user is asking Blueprint for help]*

---

Rules:
- Only use information present in the raw content — do not invent or extrapolate
- Keep APB frameworks verbatim where possible
- If the content covers multiple distinct topics, create separate entries for each (each starting with ## COURSE:)
- Output ONLY the formatted markdown — no preamble or explanation
`;

function supabaseUrl() {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    null
  );
}

function getSupabaseForLearn() {
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error('SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  // A WebSocket transport, or supabase-js refuses to create the client on Node 20 (see knowledgeBase.js).
  return createClient(url, key, { realtime: { transport: WebSocket } });
}

function detectTargetFile(content) {
  const c = content.toLowerCase();
  if (
    c.includes('wipaa') ||
    c.includes('pricing') ||
    c.includes('cash flow') ||
    c.includes('construction slots') ||
    c.includes('revenue forecast') ||
    c.includes('financial')
  ) return 'apb-financials.md';
  if (
    c.includes('marketing') ||
    c.includes('lead') ||
    c.includes('referral') ||
    c.includes('social media') ||
    c.includes('website') ||
    c.includes('brand')
  ) return 'apb-marketing.md';
  if (
    c.includes('qualifying') ||
    c.includes('discovery') ||
    c.includes('proposal') ||
    c.includes('prelim') ||
    c.includes('winning offer') ||
    c.includes('contract')
  ) return 'apb-presales.md';
  if (
    c.includes('closing') ||
    c.includes('objection') ||
    c.includes('sales blueprint') ||
    c.includes('pipeline')
  ) return 'apb-sales.md';
  if (
    c.includes('strategic planning') ||
    c.includes('quarterly') ||
    c.includes('team meeting') ||
    c.includes('systemis') ||
    c.includes('operations') ||
    c.includes('recruit') ||
    c.includes('culture')
  ) return 'apb-operations.md';
  return 'apb-general.md';
}

function safeKnowledgeFileName(value) {
  const file = String(value || '').trim();
  if (!file) return '';
  if (!/^[a-z0-9._-]+\.md$/i.test(file) || file.includes('..')) {
    throw new Error('target_file must be a safe markdown filename, e.g. apb-presales.md');
  }
  return file;
}

async function formatKnowledge(content) {
  const response = await createForTask(getAnthropic(), 'blueprint_utility', {
    max_tokens: Math.min(MAX_TOKENS, 8000),
    temperature: 0.2,   // dropped automatically for models that don't take it
    messages: [
      {
        role: 'user',
        content: `${KNOWLEDGE_FORMAT_PROMPT}\n\nRAW CONTENT TO FORMAT:\n\n${content}`,
      },
    ],
  }, { module: 'blueprintRoutes' });
  const text = response.content.find((b) => b.type === 'text')?.text?.trim();
  if (!text) throw new Error('Claude returned no formatted knowledge text');
  return text;
}

function requireLearnAccess(req, res) {
  const configuredKey = process.env.BLUEPRINT_LEARN_KEY?.trim();
  if (process.env.NODE_ENV !== 'production' && !configuredKey) return true;
  if (!configuredKey) {
    res.status(500).json({ error: 'BLUEPRINT_LEARN_KEY is not configured' });
    return false;
  }
  if (req.get('x-blueprint-key') !== configuredKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export function registerBlueprintRoutes(app) {
  app.get('/api/blueprint/health', (_req, res) => {
    res.json({
      ok: true,
      version: BLUEPRINT_AGENT_VERSION,
      model: chatModel(),
      ai: aiModelStatus(),
      tools: ['web_search', 'hub_list_subcontractors', 'hub_update_subcontractor', 'hub_list_jobs'],
      ...getHubStatus(),
    });
  });

  app.post('/api/blueprint/chat/stream', requireAuth, async (req, res) => {
    try {
      const { messages, jobContext, hubContext, attachments } = req.body;
      if (Array.isArray(attachments) && attachments.length > 0) {
        return res.status(422).json({ fallback: true, reason: 'attachments' });
      }
      // The same history bound as the non-streaming path: the last turns, not the whole chat (review CONV-01).
      const chatMessages = trimChatHistory(sanitizeMessages(messages), MAX_HISTORY);
      const lastUserText = [...chatMessages].reverse().find((m) => m.role === 'user')?.content || '';
      let systemPrompt = await buildChatSystemPrompt('chat', lastUserText, { jobContext, hubContext });
      const woAppend = await resolveWinningOfferAppend(hubContext);
      if (woAppend) systemPrompt += woAppend;
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      const stream = streamForTask(
        getAnthropic(),
        'blueprint_chat',
        {
          max_tokens: Math.min(MAX_TOKENS, 8000),
          system: systemPrompt
            ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
            : undefined,
          messages: chatMessages,
        },
        { module: 'blueprintRoutes' },
        { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31,web-search-2025-03-05' } },
      );
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      console.error('[blueprint/chat/stream]', err.message);
      // Never the provider's raw text (CLAUDE.md): say what kind of failure it was.
      const { status, friendly } = friendlyAiError(err);
      if (!res.headersSent) {
        res.status(status).json({ ok: false, error: friendly });
      } else {
        res.write(`data: ${JSON.stringify({ error: friendly })}\n\n`);
        res.end();
      }
    }
  });

  app.post('/api/blueprint/chat', requireAuth, async (req, res) => {
    try {
      const { messages, jobContext, attachments } = req.body;
      let { hubContext } = req.body;
      const hasReviewableAttachment = Array.isArray(attachments) && attachments.some(
        (a) => a?.kind === 'pdf' || a?.kind === 'text',
      );

      if (hasReviewableAttachment) {
        const reviewClient = getAnthropic();
        const reply = await runAttachmentDocumentReview({
          // Task "blueprint_document_review" (env AI_MODEL_BLUEPRINT_DOCUMENT_REVIEW, or the older BLUEPRINT_REVIEW_MODEL).
          callModel: (params) => createForTask(reviewClient, 'blueprint_document_review', params, { module: 'blueprintDocumentReview' }),
          attachments,
          messages,
          jobContext,
          maxTokens: Math.min(MAX_TOKENS, 8192), // room to think: the review model thinks before it writes
        });
        return res.json({ reply });
      }

      // Inject recent project insights for Blueprint context
      if (hubContext?.jobId) {
        try {
          const sbInsights = getServiceSupabase();
          const insights = await getJobInsights(hubContext.jobId, sbInsights, { limit: 3 });
          if (insights.length) {
            hubContext = {
              ...hubContext,
              recent_insights: insights.map(i => ({
                severity:     i.severity,
                title:        i.title,
                body:         i.body,
                trigger:      i.trigger_type,
                generated_at: i.generated_at,
              })),
            };
          }
        } catch (e) {
          // Non-fatal — Blueprint still works without insights
          console.warn('[blueprint] insights fetch failed:', e.message);
        }
      }

      const chatMessages = attachDocumentsToLastUserMessage(messages, attachments);
      const reply = await callClaude('chat', chatMessages, { jobContext, hubContext });
      res.json({ reply });
    } catch (err) {
      console.error('[blueprint/chat]', err.message);
      // Map known provider failures to friendly messages + a sensible status; never leak the raw
      // provider error string to the browser (CLAUDE.md).
      const { status, friendly } = friendlyAiError(err);
      res.status(status).json({ error: friendly });
    }
  });

  app.post('/api/blueprint/learn', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      if (!requireLearnAccess(req, res)) return;

      const content = String(req.body?.content || '').trim();
      const source = String(req.body?.source || 'direct-input').trim();
      const requestedCourseName = String(req.body?.course_name || '').trim();
      if (!content) return res.status(400).json({ error: 'content is required' });

      const formattedText = await formatKnowledge(content);
      const fileName = safeKnowledgeFileName(req.body?.target_file) || detectTargetFile(formattedText);
      const filePath = join(KNOWLEDGE_DIR, fileName);
      fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });

      const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
      const courseName = courseNameFromMarkdown(formattedText, requestedCourseName || source || 'Direct Input');
      if (existing.includes(`## COURSE: ${courseName}`)) {
        return res.json({
          success: false,
          message: `"${courseName}" already exists in ${fileName} — delete the existing entry first to update it`,
          saved_to: filePath,
          embedded: false,
        });
      }

      if (!existing) {
        const title = fileName.replace('.md', '').replace(/^apb-/, '').replace(/-/g, ' ').toUpperCase();
        fs.writeFileSync(
          filePath,
          `# APB Knowledge — ${title}\n# Blue Leaf Hub — Blueprint AI Manager\n\n---\n\n`,
          'utf8',
        );
      }
      fs.appendFileSync(filePath, `\n\n${formattedText}\n`, 'utf8');

      const supabase = getSupabaseForLearn();
      const indexed = await indexLearnedKnowledge(supabase, { formattedText, fileName });
      res.json({
        success: true,
        message: `Blueprint has learned: ${courseName}`,
        saved_to: filePath,
        embedded: indexed.count > 0,
        index_mode: indexed.mode,
        embedded_chunks: indexed.count,
      });
    } catch (err) {
      console.error('[blueprint/learn]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/blueprint/review-document', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const documentText = String(req.body?.documentText || '').trim();
      const documentType = String(req.body?.documentType || 'rfq').trim() || 'rfq';

      if (!documentText) {
        return res.status(400).json({ error: 'documentText is required' });
      }

      const response = await createForTask(getAnthropic(), 'blueprint_utility', {
        max_tokens: MAX_TOKENS,
        temperature: 0.2,
        system: QC_REVIEW_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Document type: ${documentType}\n\n---\n\n${documentText}`,
          },
        ],
      }, { module: 'blueprintRoutes' });

      const raw = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();

      const parsed = parseQCReviewJson(raw);

      res.json({
        score: parsed.score,
        summary: parsed.summary,
        issues: parsed.issues,
        revisedDocument: parsed.revised_document,
      });
    } catch (err) {
      console.error('[blueprint/review-document]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/blueprint/generate-sop', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const { messages } = req.body;
      const reply = await callClaude('sop', messages);
      res.json({ reply });
    } catch (err) {
      console.error('[blueprint/generate-sop]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/blueprint/troubleshoot', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const { messages } = req.body;
      const reply = await callClaude('troubleshoot', messages);
      res.json({ reply });
    } catch (err) {
      console.error('[blueprint/troubleshoot]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  const { primary, fallback } = modelsFor('blueprint_chat');
  console.log(`[blueprint] routes registered (${BLUEPRINT_AGENT_VERSION}, model=${primary}, fallback=${fallback})`);
}

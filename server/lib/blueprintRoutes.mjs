import Anthropic from '@anthropic-ai/sdk';
import { config as dotenvConfig } from 'dotenv';
import { runBlueprintAgent, BLUEPRINT_AGENT_VERSION, getHubStatus } from '../../src/blueprint/agent/runAgent.js';
import { QC_REVIEW_SYSTEM_PROMPT, parseQCReviewJson } from './blueprintQc.js';

const { parsed: _env = {} } = dotenvConfig();
const _apiKey = process.env.ANTHROPIC_API_KEY?.trim() || _env.ANTHROPIC_API_KEY?.trim();

const VALID_MODELS = ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-20250514'];
const _envModel = (_env.CLAUDE_MODEL || process.env.CLAUDE_MODEL || process.env.BLUEPRINT_MODEL || '').trim();
const MODEL = VALID_MODELS.includes(_envModel) ? _envModel : 'claude-sonnet-4-6';

const MAX_TOKENS = parseInt(_env.BLUEPRINT_MAX_TOKENS || process.env.BLUEPRINT_MAX_TOKENS || '8000');

let _anthropic;
function getAnthropic() {
  if (!_anthropic) {
    if (!_apiKey) throw new Error('ANTHROPIC_API_KEY not set in .env');
    _anthropic = new Anthropic({ apiKey: _apiKey });
  }
  return _anthropic;
}

async function callClaude(mode, messages, extras = {}) {
  return runBlueprintAgent({
    anthropic: getAnthropic(),
    model: MODEL,
    maxTokens: MAX_TOKENS,
    mode,
    messages,
    extras,
  });
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

export function registerBlueprintRoutes(app) {
  app.get('/api/blueprint/health', (_req, res) => {
    res.json({
      ok: true,
      version: BLUEPRINT_AGENT_VERSION,
      model: MODEL,
      tools: ['web_search', 'hub_list_subcontractors', 'hub_update_subcontractor', 'hub_list_jobs'],
      ...getHubStatus(),
    });
  });

  app.post('/api/blueprint/chat', async (req, res) => {
    try {
      const { messages, jobContext, hubContext, attachments } = req.body;
      const chatMessages = attachDocumentsToLastUserMessage(messages, attachments);
      const reply = await callClaude('chat', chatMessages, { jobContext, hubContext });
      res.json({ reply });
    } catch (err) {
      console.error('[blueprint/chat]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/blueprint/review-document', async (req, res) => {
    try {
      const documentText = String(req.body?.documentText || '').trim();
      const documentType = String(req.body?.documentType || 'rfq').trim() || 'rfq';

      if (!documentText) {
        return res.status(400).json({ error: 'documentText is required' });
      }

      const response = await getAnthropic().messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.2,
        system: QC_REVIEW_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Document type: ${documentType}\n\n---\n\n${documentText}`,
          },
        ],
      });

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

  app.post('/api/blueprint/generate-sop', async (req, res) => {
    try {
      const { messages } = req.body;
      const reply = await callClaude('sop', messages);
      res.json({ reply });
    } catch (err) {
      console.error('[blueprint/generate-sop]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/blueprint/troubleshoot', async (req, res) => {
    try {
      const { messages } = req.body;
      const reply = await callClaude('troubleshoot', messages);
      res.json({ reply });
    } catch (err) {
      console.error('[blueprint/troubleshoot]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  console.log(`[blueprint] routes registered (${BLUEPRINT_AGENT_VERSION}, model=${MODEL})`);
}

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { config as dotenvConfig } from 'dotenv';
import fs, { existsSync } from 'fs';
import { join } from 'path';
import { runBlueprintAgent, BLUEPRINT_AGENT_VERSION, getHubStatus } from '../../src/blueprint/agent/runAgent.js';
import { voyageEmbedBatch } from '../../src/blueprint/lib/voyageEmbeddings.js';
import { QC_REVIEW_SYSTEM_PROMPT, parseQCReviewJson } from './blueprintQc.js';

const { parsed: _env = {} } = dotenvConfig();
const _apiKey = process.env.ANTHROPIC_API_KEY?.trim() || _env.ANTHROPIC_API_KEY?.trim();

const VALID_MODELS = ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-20250514'];
const _envModel = (_env.CLAUDE_MODEL || process.env.CLAUDE_MODEL || process.env.BLUEPRINT_MODEL || '').trim();
const MODEL = VALID_MODELS.includes(_envModel) ? _envModel : 'claude-sonnet-4-6';

const MAX_TOKENS = parseInt(_env.BLUEPRINT_MAX_TOKENS || process.env.BLUEPRINT_MAX_TOKENS || '8000');
const DEFAULT_KNOWLEDGE_DIR = existsSync(join(process.cwd(), '../blueprint-agent/src/blueprint/knowledge'))
  ? join(process.cwd(), '../blueprint-agent/src/blueprint/knowledge')
  : join(process.cwd(), 'src/blueprint/knowledge');
const KNOWLEDGE_DIR = process.env.BLUEPRINT_KNOWLEDGE_DIR?.trim() || DEFAULT_KNOWLEDGE_DIR;

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
  return createClient(url, key);
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

function courseNameFromMarkdown(markdown, fallback = 'Direct Input') {
  const match = markdown.match(/## COURSE:\s*(.+)/);
  return (match ? match[1] : fallback).trim();
}

function chunkText(text) {
  const chunks = [];
  const max = 2000;
  const overlap = 200;
  let start = 0;
  while (start < text.length) {
    let chunk = text.slice(start, Math.min(start + max, text.length));
    const lastBreak = Math.max(chunk.lastIndexOf('\n\n'), chunk.lastIndexOf('. '));
    if (start + max < text.length && lastBreak > max * 0.5) chunk = chunk.slice(0, lastBreak + 1);
    if (chunk.trim().length > 50) chunks.push(chunk.trim());
    start += Math.max(1, chunk.length - overlap);
  }
  return chunks;
}

function knowledgeSections(markdown) {
  const sections = markdown.split(/(?=## COURSE:)/).filter((s) => s.trim().length > 50);
  return sections.length ? sections : [markdown];
}

async function formatKnowledge(content) {
  const response = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: Math.min(MAX_TOKENS, 8000),
    temperature: 0.2,
    messages: [
      {
        role: 'user',
        content: `${KNOWLEDGE_FORMAT_PROMPT}\n\nRAW CONTENT TO FORMAT:\n\n${content}`,
      },
    ],
  });
  const text = response.content.find((b) => b.type === 'text')?.text?.trim();
  if (!text) throw new Error('Claude returned no formatted knowledge text');
  return text;
}

async function embedKnowledgeEntry({ formattedText, fileName }) {
  const supabase = getSupabaseForLearn();
  const rows = [];
  let chunkIndex = 0;

  for (const section of knowledgeSections(formattedText)) {
    const courseName = courseNameFromMarkdown(section);
    for (const chunk of chunkText(section)) {
      rows.push({
        source_file: fileName,
        course_name: courseName,
        chunk_index: chunkIndex++,
        chunk_text: chunk,
      });
    }
  }

  const embeddings = await voyageEmbedBatch(rows.map((r) => r.chunk_text.slice(0, 32000)), 'document');
  const records = rows.map((row, index) => ({ ...row, embedding: embeddings[index] }));
  const { error } = await supabase.from('blueprint_knowledge').insert(records);
  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
  return records.length;
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

  app.post('/api/blueprint/learn', async (req, res) => {
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

      const embeddedChunks = await embedKnowledgeEntry({ formattedText, fileName });
      res.json({
        success: true,
        message: `Blueprint has learned: ${courseName}`,
        saved_to: filePath,
        embedded: true,
        embedded_chunks: embeddedChunks,
      });
    } catch (err) {
      console.error('[blueprint/learn]', err.message);
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

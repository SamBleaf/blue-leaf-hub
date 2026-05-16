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
      const { messages, jobContext, hubContext } = req.body;
      const reply = await callClaude('chat', messages, { jobContext, hubContext });
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

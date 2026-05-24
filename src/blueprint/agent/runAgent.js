/**
 * Blueprint — Claude agent loop with web search + Blue Leaf Hub tools.
 */

import { getRelevantContext } from './knowledgeBase.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { getAgentTools, executeHubTool, isHubTool } from './tools.js';
import { listSubcontractors, getHubStatus } from './hubDatabase.js';

const MAX_TOOL_ROUNDS = 12;
const BLUEPRINT_AGENT_VERSION = '2.1.0-tools';

export { BLUEPRINT_AGENT_VERSION, getHubStatus };

function extractText(content) {
  return (content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

function messageText(message) {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return extractText(content);
  return '';
}

function hubToolUses(content) {
  return (content || []).filter((b) => b.type === 'tool_use' && isHubTool(b.name));
}

function wantsSubcontractorData(text, hubContext) {
  const page = hubContext?.page || '';
  if (page.includes('subcontractor')) return true;
  return /subcontractor|sub.?contractor|missing info|missing field|incomplete (profile|record)|abn|trade list/i.test(
    text,
  );
}

async function appendSubcontractorSnapshot(systemPrompt) {
  const snap = await listSubcontractors({ missingOnly: false, limit: 100 });
  if (!snap.ok) {
    return (
      systemPrompt +
      `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nLIVE DATABASE STATUS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Subcontractor query failed: ${snap.error}\n` +
      `Tell Sam to check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Hub .env file, then restart npm run dev.`
    );
  }

  const incomplete = snap.subcontractors.filter((s) => s.missing_count > 0);
  const summary = {
    total_subcontractors: snap.count,
    subcontractors_with_missing_fields: incomplete.length,
    total_missing_field_slots: snap.total_missing_field_slots,
    required_fields: ['contact', 'mobile', 'abn', 'address'],
    incomplete: incomplete.map((s) => ({
      id: s.id,
      business_name: s.business_name,
      trade: s.trade,
      missing_fields: s.missing_fields,
    })),
  };

  return (
    systemPrompt +
    `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nLIVE SUBCONTRACTOR DATABASE (queried now)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${JSON.stringify(summary, null, 2)}\n\n` +
    `You have this live data. Use it in your answer. For updates, use hub_update_subcontractor after Sam confirms.`
  );
}

/**
 * @param {object} opts
 * @param {import('@anthropic-ai/sdk').Anthropic} opts.anthropic
 * @param {string} opts.model
 * @param {number} opts.maxTokens
 * @param {string} opts.mode - chat | qc | sop | troubleshoot | proposal
 * @param {Array<{role:string, content:string}>} opts.messages
 * @param {object} [opts.extras] - jobContext, hubContext, enableTools
 */
function messageHasDocumentBlock(messages) {
  return (messages || []).some((m) => {
    const c = m?.content;
    return Array.isArray(c) && c.some((b) => b?.type === 'document');
  });
}

function trimChatHistory(messages, maxTurns = 8) {
  const cleaned = (messages || []).filter((m) => m?.role === 'user' || m?.role === 'assistant');
  if (cleaned.length <= maxTurns) return cleaned;
  return cleaned.slice(-maxTurns);
}

export async function buildChatSystemPrompt(mode, lastUserText, extras = {}) {
  const jobId = extras.jobContext?.id ?? null;
  const ragContext = await getRelevantContext(lastUserText, { jobId, limit: 5 });
  let systemPrompt = buildSystemPrompt(mode, ragContext, extras.jobContext || null);
  if (extras.hubContext) {
    systemPrompt += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nHUB UI CONTEXT\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${JSON.stringify(extras.hubContext, null, 2)}`;
  }
  if (wantsSubcontractorData(lastUserText, extras.hubContext)) {
    systemPrompt = await appendSubcontractorSnapshot(systemPrompt);
  }
  if (extras.systemPromptAppend) {
    systemPrompt += extras.systemPromptAppend;
  }
  return systemPrompt;
}

export async function runBlueprintAgent({ anthropic, model, maxTokens, mode, messages, extras = {} }) {
  const compact = extras.compactContext === true || messageHasDocumentBlock(messages);
  const workingMessages = compact ? trimChatHistory(messages, 6) : messages;
  const lastUser = messageText([...workingMessages].reverse().find((m) => m.role === 'user'));
  const jobId = extras.jobContext?.id ?? null;
  const ragLimit = compact ? 2 : 5;
  const ragContext = await getRelevantContext(lastUser, { jobId, limit: ragLimit });

  let systemPrompt = buildSystemPrompt(mode, ragContext, extras.jobContext || null);

  if (extras.hubContext) {
    systemPrompt += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nHUB UI CONTEXT\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${JSON.stringify(extras.hubContext, null, 2)}`;
  }

  const subDataQuery = wantsSubcontractorData(lastUser, extras.hubContext);
  if (subDataQuery) {
    systemPrompt = await appendSubcontractorSnapshot(systemPrompt);
  }
  if (extras.systemPromptAppend) {
    systemPrompt += extras.systemPromptAppend;
  }

  const useTools = extras.enableTools !== false;
  const tools = useTools ? getAgentTools() : undefined;

  let currentMessages = workingMessages;
  let lastResponse = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const request = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: currentMessages,
      ...(tools ? { tools } : {}),
    };

    // First turn on sub queries: force a database read so the model cannot claim "no access"
    if (tools && subDataQuery && round === 0) {
      request.tool_choice = { type: 'tool', name: 'hub_list_subcontractors' };
    }

    const response = await anthropic.messages.create(
      {
        ...request,
        system: request.system
          ? [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }]
          : undefined,
      },
      { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } },
    );

    lastResponse = response;
    const pending = hubToolUses(response.content);

    if (!pending.length) {
      const text = extractText(response.content);
      if (text) return text;
      if (response.stop_reason === 'end_turn') return text || 'Done.';
      break;
    }

    const toolResults = await Promise.all(
      pending.map(async (block) => {
        try {
          const result = await executeHubTool(block.name, block.input);
          return {
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          };
        } catch (err) {
          return {
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ ok: false, error: err.message }),
            is_error: true,
          };
        }
      }),
    );

    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults },
    ];
  }

  return extractText(lastResponse?.content) || 'I hit the tool step limit. Say "continue" and I\'ll pick up where I left off.';
}

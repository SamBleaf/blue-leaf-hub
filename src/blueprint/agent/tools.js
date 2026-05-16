/**
 * Blueprint agent tools — Anthropic definitions + Hub executors.
 */

import {
  listSubcontractors,
  getSubcontractor,
  updateSubcontractor,
  listJobs,
  getJob,
  saveDocumentReview,
} from './hubDatabase.js';

/** Built-in Anthropic web search (no executor — API handles it). */
export const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 8,
};

export const HUB_TOOL_DEFINITIONS = [
  {
    name: 'hub_list_subcontractors',
    description:
      'List subcontractors in Blue Leaf Hub. Returns missing_fields per record (contact, mobile, abn, address). Use missing_only:true to focus on incomplete records.',
    input_schema: {
      type: 'object',
      properties: {
        missing_only: { type: 'boolean', description: 'Only subs with at least one missing required field' },
        trade: { type: 'string', description: 'Filter by trade (partial match)' },
        limit: { type: 'number', description: 'Max rows (default 100)' },
      },
    },
  },
  {
    name: 'hub_get_subcontractor',
    description: 'Get one subcontractor by UUID with missing_fields summary.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Subcontractor UUID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'hub_update_subcontractor',
    description:
      'Update subcontractor fields in Blue Leaf Hub. ONLY call with confirmed:true after the user has approved each field and its source. Never auto-write unverified data.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        confirmed: { type: 'boolean', description: 'Must be true — user approved the update' },
        source: { type: 'string', description: 'Where the data came from (e.g. company website, ABN lookup)' },
        contact: { type: 'string' },
        mobile: { type: 'string' },
        email: { type: 'string' },
        abn: { type: 'string' },
        address: { type: 'string' },
        suburb: { type: 'string' },
        state: { type: 'string' },
        postcode: { type: 'string' },
        notes: { type: 'string' },
        trade: { type: 'string' },
      },
      required: ['id', 'confirmed'],
    },
  },
  {
    name: 'hub_list_jobs',
    description: 'List jobs/projects in Blue Leaf Hub (address, client, status).',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'hub_get_job',
    description: 'Get full job record by UUID for RFQ/proposal context.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'hub_save_document_review',
    description: 'Persist a document QC review to document_reviews (audit trail).',
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        document_type: { type: 'string', enum: ['proposal', 'rfq', 'sop', 'email', 'contract'] },
        document_text: { type: 'string' },
        score: { type: 'number' },
        issues: { type: 'array', items: { type: 'object' } },
        revised_document: { type: 'string' },
      },
      required: ['document_type', 'score'],
    },
  },
];

export function getAgentTools() {
  return [WEB_SEARCH_TOOL, ...HUB_TOOL_DEFINITIONS];
}

export async function executeHubTool(name, input) {
  switch (name) {
    case 'hub_list_subcontractors':
      return listSubcontractors({
        missingOnly: Boolean(input?.missing_only),
        trade: input?.trade || null,
        limit: input?.limit || 100,
      });
    case 'hub_get_subcontractor':
      return getSubcontractor(input.id);
    case 'hub_update_subcontractor': {
      const { id, confirmed, source, ...fields } = input || {};
      return updateSubcontractor(id, fields, { confirmed: Boolean(confirmed), source: source || '' });
    }
    case 'hub_list_jobs':
      return listJobs({ status: input?.status || null, limit: input?.limit || 50 });
    case 'hub_get_job':
      return getJob(input.id);
    case 'hub_save_document_review':
      return saveDocumentReview({
        jobId: input?.job_id || null,
        documentType: input?.document_type,
        documentText: input?.document_text,
        score: input?.score,
        issues: input?.issues,
        revisedDocument: input?.revised_document,
      });
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}

export function isHubTool(name) {
  return typeof name === 'string' && name.startsWith('hub_');
}

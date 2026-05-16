/**
 * knowledgeBase.js
 * RAG — vector (blueprint_knowledge) + FTS (knowledge_chunks).
 */

import { createClient } from '@supabase/supabase-js';
import { embedQueryVector } from '../lib/voyageEmbeddings.js';

function getSupabase() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

function formatVectorRows(rows) {
  if (!rows?.length) return '';
  return rows
    .map((r) => {
      const head = [r.course_name, r.source_file].filter(Boolean).join(' — ');
      const pct =
        r.similarity != null ? ` (similarity ${(Number(r.similarity) * 100).toFixed(1)}%)` : '';
      return `### ${head || 'Knowledge'}${pct}\n${r.chunk_text}`;
    })
    .join('\n\n---\n\n');
}

async function vectorSimilaritySearch(supabase, query, limit) {
  if (!process.env.VOYAGE_API_KEY?.trim()) return [];

  try {
    const embedding = await embedQueryVector(query);

    const { data, error } = await supabase.rpc('match_blueprint_knowledge', {
      query_embedding: embedding,
      match_count: limit,
    });

    if (error) {
      console.warn('[Blueprint RAG] Vector RPC:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('[Blueprint RAG] Vector search failed:', err.message);
    return [];
  }
}

export async function getRelevantContext(query, options = {}) {
  const { limit = 5, category = null, apbLevel = null, jobId = null } = options;
  const supabase = getSupabase();
  if (!supabase) return '';
  try {
    const parts = [];

    if (jobId) {
      const jobCtx = await getJobKnowledge(supabase, jobId);
      if (jobCtx) parts.push(jobCtx);
    }

    const vectorRows = await vectorSimilaritySearch(supabase, query, limit);
    if (vectorRows.length > 0) {
      parts.push(formatVectorRows(vectorRows));
    } else {
      let result = await fullTextSearch(supabase, query, { limit, category, apbLevel });
      if (!result || result.length === 0) {
        result = await trigramSearch(supabase, query, { limit, category });
      }
      if (result && result.length > 0) parts.push(formatContext(result));
    }

    if (parts.length === 0) return '';
    return parts.join('\n\n---\n\n');
  } catch (err) {
    console.warn('[Blueprint RAG] Context retrieval failed:', err.message);
    return '';
  }
}

async function getJobKnowledge(supabase, jobId) {
  const { data, error } = await supabase
    .from('job_knowledge')
    .select('kind, content, data, updated_at')
    .eq('job_id', jobId)
    .order('updated_at', { ascending: false })
    .limit(20);
  if (error || !data || data.length === 0) return null;
  const lines = data.map((row) => `[${row.kind.toUpperCase()}] ${row.content}`);
  return `### Job Knowledge\n${lines.join('\n')}`;
}

async function fullTextSearch(supabase, query, { limit, category, apbLevel }) {
  const tsQuery = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter((w) => w.length > 2)
    .join(' & ');
  if (!tsQuery) return [];

  let q = supabase
    .from('knowledge_chunks')
    .select('course_name, section, category, apb_level, content')
    .textSearch('content', tsQuery, { type: 'websearch', config: 'english' })
    .limit(limit);
  if (category) q = q.eq('category', category);
  if (apbLevel != null) q = q.eq('apb_level', apbLevel);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function trigramSearch(supabase, query, { limit, category }) {
  const { data, error } = await supabase.rpc('search_knowledge_trigram', {
    search_query: query.slice(0, 200),
    match_limit: limit,
    filter_category: category || null,
  });
  if (error) return [];
  return data || [];
}

function formatContext(chunks) {
  return chunks
    .map((chunk) => {
      const header = [
        chunk.course_name,
        chunk.section,
        chunk.category ? `[${chunk.category}]` : '',
        chunk.apb_level != null ? `Level ${chunk.apb_level}` : '',
      ]
        .filter(Boolean)
        .join(' — ');
      return `### ${header}\n${chunk.content}`;
    })
    .join('\n\n---\n\n');
}

export async function checkKnowledgeBase() {
  const supabase = getSupabase();
  if (!supabase) return { available: false, reason: 'Supabase not configured' };

  const [fts, vec] = await Promise.all([
    supabase.from('knowledge_chunks').select('*', { count: 'exact', head: true }),
    supabase.from('blueprint_knowledge').select('*', { count: 'exact', head: true }),
  ]);

  const ftsOk = !fts.error;
  const vecOk = !vec.error;

  if (!ftsOk && !vecOk) {
    return { available: false, reason: fts.error?.message || vec.error?.message };
  }

  return {
    available: true,
    chunkCount: fts.count ?? 0,
    vectorChunkCount: vecOk ? vec.count ?? 0 : null,
    vectorEnabled: Boolean(process.env.VOYAGE_API_KEY?.trim() && vecOk && (vec.count ?? 0) > 0),
  };
}

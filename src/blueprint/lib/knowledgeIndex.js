/**
 * Index learned knowledge into Supabase (default: knowledge_chunks full-text search).
 * Voyage/pgvector only when BLUEPRINT_USE_VOYAGE=true and VOYAGE_API_KEY is set.
 */

import { courseNameFromMarkdown, knowledgeSections, chunkText } from './knowledgeChunking.js';
import { upsertFtsKnowledgeChunks } from './ftsKnowledgeIndex.js';

/** Opt-in semantic vectors — off by default. */
export function shouldUseVoyageVectors() {
  const optIn =
    process.env.BLUEPRINT_USE_VOYAGE === 'true' || process.env.BLUEPRINT_USE_VOYAGE === '1';
  return optIn && Boolean(process.env.VOYAGE_API_KEY?.trim());
}

async function embedToBlueprintKnowledge(supabase, formattedText, fileName) {
  const { voyageEmbedBatch } = await import('./voyageEmbeddings.js');
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

  if (rows.length === 0) return 0;

  const embeddings = await voyageEmbedBatch(
    rows.map((r) => r.chunk_text.slice(0, 32000)),
    'document',
  );
  const records = rows.map((row, index) => ({ ...row, embedding: embeddings[index] }));
  const { error } = await supabase.from('blueprint_knowledge').insert(records);
  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
  return records.length;
}

/**
 * @returns {{ mode: 'vector' | 'fts', count: number }}
 */
export async function indexLearnedKnowledge(supabase, { formattedText, fileName }) {
  if (shouldUseVoyageVectors()) {
    try {
      const count = await embedToBlueprintKnowledge(supabase, formattedText, fileName);
      return { mode: 'vector', count };
    } catch (err) {
      console.warn('[learn] Voyage vector index failed, using Supabase FTS:', err.message);
    }
  }

  const count = await upsertFtsKnowledgeChunks(supabase, formattedText, fileName);
  if (count === 0) {
    throw new Error('No knowledge chunks indexed — check Supabase connection and knowledge_chunks table');
  }
  return { mode: 'fts', count };
}

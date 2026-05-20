/**
 * Index formatted knowledge into Supabase knowledge_chunks (full-text search).
 * No embedding API — uses Anthropic + Supabase already configured on Hub.
 */

import { courseNameFromMarkdown, knowledgeSections, chunkText } from './knowledgeChunking.js';

function categoryFromFileName(fileName) {
  return fileName.replace(/^apb-/, '').replace(/\.md$/i, '').replace(/-/g, ' ');
}

/** Build FTS rows from one ## COURSE block (split on ### subsections when present). */
export function ftsChunksFromCourseSection(sectionMarkdown, fileName) {
  const category = categoryFromFileName(fileName);
  const courseName = courseNameFromMarkdown(sectionMarkdown, 'Unknown');
  const rows = [];

  const subsections = sectionMarkdown.split(/^### /m).filter((s) => s.trim().length > 20);
  if (subsections.length <= 1) {
    for (const text of chunkText(sectionMarkdown.trim())) {
      rows.push({
        source: 'APB Course',
        course_name: courseName,
        section: `overview-${rows.length + 1}`,
        category,
        apb_level: null,
        content: text,
      });
    }
    return rows;
  }

  for (const sub of subsections) {
    const lines = sub.trim().split('\n');
    const title = lines[0].trim();
    if (/^COURSE:/i.test(title)) continue;
    const body = lines.slice(1).join('\n').trim();
    if (body.length < 20) continue;
    const sectionKey = title.slice(0, 180) || 'section';
    rows.push({
      source: 'APB Course',
      course_name: courseName,
      section: sectionKey,
      category,
      apb_level: null,
      content: `### ${title}\n\n${body}`,
    });
  }

  return rows;
}

export function ftsChunksFromFormattedText(formattedText, fileName) {
  const rows = [];
  for (const section of knowledgeSections(formattedText)) {
    rows.push(...ftsChunksFromCourseSection(section, fileName));
  }
  return rows;
}

export async function upsertFtsKnowledgeChunks(supabase, formattedText, fileName) {
  const chunks = ftsChunksFromFormattedText(formattedText, fileName);
  let count = 0;
  for (const chunk of chunks) {
    const { error } = await supabase
      .from('knowledge_chunks')
      .upsert(chunk, { onConflict: 'course_name,section' });
    if (error) {
      console.warn(`[FTS index] skip "${chunk.section}":`, error.message);
    } else {
      count++;
    }
  }
  return count;
}

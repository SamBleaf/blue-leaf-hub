/** Shared chunking helpers for Blueprint knowledge ingest / learn. */

export function courseNameFromMarkdown(markdown, fallback = 'Direct Input') {
  const match = markdown.match(/## COURSE:\s*(.+)/);
  return (match ? match[1] : fallback).trim();
}

export function knowledgeSections(markdown) {
  const sections = markdown.split(/(?=## COURSE:)/).filter((s) => s.trim().length > 50);
  return sections.length ? sections : [markdown];
}

export function chunkText(text, { max = 2000, overlap = 200 } = {}) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let chunk = text.slice(start, Math.min(start + max, text.length));
    const lastBreak = Math.max(chunk.lastIndexOf('\n\n'), chunk.lastIndexOf('. '));
    if (start + max < text.length && lastBreak > max * 0.5) {
      chunk = chunk.slice(0, lastBreak + 1);
    }
    if (chunk.trim().length > 50) chunks.push(chunk.trim());
    start += Math.max(1, chunk.length - overlap);
  }
  return chunks;
}

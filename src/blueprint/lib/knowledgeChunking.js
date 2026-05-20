export function courseNameFromMarkdown(text) {
  return text?.split('\n')[0]?.replace(/^#+\s*/, '') || 'Untitled';
}

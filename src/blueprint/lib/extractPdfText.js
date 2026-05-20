/**
 * Extract plain text from a PDF (base64) for Blueprint document review.
 * Avoids sending full PDF binaries to Claude (large token / rate-limit hits).
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * @param {string} base64
 * @param {{ maxChars?: number }} [opts]
 * @returns {Promise<{ text: string, pages: number, truncated: boolean }>}
 */
export async function extractPdfTextFromBase64(base64, opts = {}) {
  const maxChars = opts.maxChars ?? 48_000;
  const data = String(base64 || '').trim();
  if (!data) throw new Error('PDF data is empty');

  const pdfParse = require('pdf-parse');
  const buffer = Buffer.from(data, 'base64');
  const parsed = await pdfParse(buffer);
  let text = String(parsed.text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  let truncated = false;
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n\n[Document truncated for review — first ~${Math.round(maxChars / 1000)}k characters of ${parsed.numpages || '?'} pages.]`;
    truncated = true;
  }

  if (text.length < 80) {
    throw new Error(
      'Could not extract readable text from this PDF (it may be scanned images only). Paste the key sections as text instead.',
    );
  }

  return { text, pages: parsed.numpages || 0, truncated };
}

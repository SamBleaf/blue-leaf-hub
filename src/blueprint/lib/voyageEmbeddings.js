/**
 * Voyage AI embeddings (Anthropic-recommended; no OpenAI).
 * @see https://platform.claude.com/docs/en/build-with-claude/embeddings
 */

const VOYAGE_EMBEDDINGS_URL = 'https://api.voyageai.com/v1/embeddings';

/**
 * @param {string[]} inputs
 * @param {'document' | 'query'} inputType
 * @returns {Promise<number[][]>}
 */
export async function voyageEmbedBatch(inputs, inputType) {
  const key = process.env.VOYAGE_API_KEY?.trim();
  if (!key) {
    throw new Error('VOYAGE_API_KEY is not set');
  }
  const model = process.env.VOYAGE_EMBEDDING_MODEL?.trim() || 'voyage-4-lite';

  const res = await fetch(VOYAGE_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      input: inputs,
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Voyage embeddings HTTP ${res.status}: ${detail}`);
  }

  /** @type {{ data: Array<{ index: number; embedding: number[] }> }} */
  const json = await res.json();
  const sorted = json.data.slice().sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
}

/**
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embedQueryVector(text) {
  const [vec] = await voyageEmbedBatch([String(text).slice(0, 32000)], 'query');
  return vec;
}

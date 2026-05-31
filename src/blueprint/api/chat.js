const BASE = import.meta.env.VITE_API_BASE_URL || '';

async function post(endpoint, body) {
  // Attach the Supabase bearer token — the server's requireAuth rejects tokenless requests
  // with "Unauthorised". (Previously only the streaming path sent auth, so the non-streaming
  // chat + the streaming-failed fallback 401'd in production where SSE doesn't pass through.)
  const authHeader = await getAuthHeader();
  const res = await fetch(`${BASE}/api/blueprint/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const raw = await res.text();
    let message = raw;
    try {
      message = JSON.parse(raw)?.error || raw;
    } catch {
      message = raw
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    if (/PayloadTooLargeError|request entity too large/i.test(message)) {
      message = 'Upload too large for Blueprint. Try a smaller PDF or paste the key section.';
    }
    if (/rate_limit|rate limit/i.test(message)) {
      message = 'Rate limit hit — wait 30 seconds and try again. If you just uploaded a PDF, restart Hub (npm run dev) so the lighter document review path is active.';
    }
    throw new Error(message || `Request failed (${res.status})`);
  }
  return res.json();
}

async function getAuthHeader() {
  try {
    const { getSupabase } = await import('../../lib/supabaseClient.js');
    const { data: { session } } = await getSupabase().auth.getSession();
    return session?.access_token ? `Bearer ${session.access_token}` : '';
  } catch {
    return '';
  }
}

export async function chat(messages, extras = {}, onChunk = null) {
  if (!onChunk) {
    return post('chat', { messages, ...extras }).then((r) => r.reply);
  }

  let response;
  try {
    const authHeader = await getAuthHeader();
    response = await fetch(`${BASE}/api/blueprint/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({ messages, ...extras }),
    });
  } catch {
    return post('chat', { messages, ...extras }).then((r) => r.reply);
  }

  if (!response.ok) {
    return post('chat', { messages, ...extras }).then((r) => r.reply);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') break;
      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.text) {
        fullText += parsed.text;
        onChunk(fullText);
      }
    }
  }

  return fullText;
}

export const reviewDocument = (documentText, documentType) =>
  post('review-document', { documentText, documentType });

export const generateSOP = (messages) =>
  post('generate-sop', { messages }).then((r) => r.reply);

export const troubleshoot = (messages) =>
  post('troubleshoot', { messages }).then((r) => r.reply);

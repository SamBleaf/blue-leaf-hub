const BASE = import.meta.env.VITE_API_BASE_URL || '';

async function post(endpoint, body) {
  const res = await fetch(`${BASE}/api/blueprint/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

export const chat = (messages, extras) =>
  post('chat', { messages, ...extras }).then(r => r.reply);

export const reviewDocument = (documentText, documentType) =>
  post('review-document', { documentText, documentType });

export const generateSOP = (messages) =>
  post('generate-sop', { messages }).then(r => r.reply);

export const troubleshoot = (messages) =>
  post('troubleshoot', { messages }).then(r => r.reply);

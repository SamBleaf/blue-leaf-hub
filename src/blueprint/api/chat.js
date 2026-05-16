const BASE = import.meta.env.VITE_API_BASE_URL || '';

async function post(endpoint, body) {
  const res = await fetch(`${BASE}/api/blueprint/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
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

// Shared speech-to-text service (OpenAI Whisper).
//
// Hub had NO audio transcription before this — every "transcript" feature
// (sales meeting analysis, site-diary memos, carpentry voice notes, marketing
// subtitles) consumed text that was transcribed externally and pasted in. This
// is the single STT entry point they should all route through.
//
// Uses the REST API via fetch (no new SDK dependency). Needs OPENAI_API_KEY.

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

export function transcriptionConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/**
 * Transcribe an audio buffer to text.
 * @param {Buffer|Uint8Array} buffer
 * @param {{ filename?:string, mimeType?:string, language?:string }} [opts]
 * @returns {Promise<string>} the transcript text
 */
export async function transcribeAudio(buffer, opts = {}) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY not configured — in-app transcription is unavailable.");
  if (!buffer || !buffer.length) throw new Error("No audio data to transcribe.");

  const { filename = "audio.webm", mimeType = "audio/webm", language = "en" } = opts;
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), filename);
  form.append("model", "whisper-1");
  if (language) form.append("language", language);
  form.append("response_format", "text");

  const res = await fetch(WHISPER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Whisper transcription failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.text()).trim();
}

// Direct client for the local Ollama server, used by the app page (Filter
// view) for status checks and test classifications. Live filtering on
// YouTube pages goes through the service worker instead — see
// public/background.js, which owns the queue and the cache.
//
// Requires OLLAMA_ORIGINS="chrome-extension://*" on the Ollama server.
// Under `npm run dev` the page origin is localhost, which Ollama rejects —
// status checks will fail there; test from the installed extension.

export const OLLAMA_URL = 'http://localhost:11434';
export const MODEL = 'gemma4';

const VERDICTS = ['quality', 'neutral', 'slop'];

/** @returns {Promise<{online: boolean, models: string[], error?: string}>} */
export async function getOllamaStatus() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) return { online: false, models: [], error: `HTTP ${res.status}` };
    const data = await res.json();
    return { online: true, models: (data.models ?? []).map((m) => m.name) };
  } catch (err) {
    return { online: false, models: [], error: String(err?.message ?? err) };
  }
}

// Keep this prompt in sync with public/background.js.
export function buildPrompt({ title, channel }) {
  const channelLine = channel ? `\nChannel: ${channel}` : '';
  // Today's date grounds the model: without it, titles mentioning dates after
  // its training cutoff (e.g. "June 2026") read as fabricated/future slop.
  const today = new Date().toISOString().slice(0, 10);
  return (
    'You are a YouTube content quality classifier. Classify this video as exactly one of: quality, neutral, slop.\n\n' +
    `Today's date: ${today}\n` +
    `Title: "${title}"${channelLine}\n\n` +
    'Dates or years in the title are not a quality signal; never mark a video slop because its date seems recent, unfamiliar, or in the future.\n' +
    'Respond with JSON only: {"verdict": "quality|neutral|slop", "confidence": <0-1>, "reason": "<10 words max>"}'
  );
}

/**
 * Classify one video with the local model.
 * @returns {Promise<{verdict: string, confidence: number, reason: string, tookMs: number}>}
 */
export async function classifyVideo({ title, channel }) {
  const started = performance.now();
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      format: 'json',
      stream: false,
      options: { temperature: 0 },
      prompt: buildPrompt({ title, channel }),
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data.response);
  if (!VERDICTS.includes(parsed.verdict)) {
    throw new Error(`Unexpected verdict: ${parsed.verdict}`);
  }
  return {
    verdict: parsed.verdict,
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    tookMs: Math.round(performance.now() - started),
  };
}

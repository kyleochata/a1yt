// Service worker: opens the app tab and runs the classification service for
// the YouTube content script (content/classifier.js).
//
// Classification pipeline per video:
//   1. trusted channel  -> quality (no LLM, not cached)
//   2. blacklist keyword -> slop   (no LLM, not cached)
//   3. IndexedDB cache hit -> cached verdict
//   4. Ollama (gemma4) on localhost:11434 -> verdict, cached
//
// Ollama runs one request at a time per model anyway, so LLM calls are
// serialized through a queue instead of being fired in parallel.

const OLLAMA_URL = 'http://localhost:11434';
const MODEL = 'gemma4';
const VERDICTS = ['quality', 'neutral', 'slop'];

const PREFS_KEY = 'ytc.preferences';
const DEFAULT_PREFERENCES = {
  trustedChannels: [],
  blacklistKeywords: [],
  sensitivity: 50,
  filteringEnabled: true,
};

// No default_popup in the manifest, so clicking the toolbar icon fires this.
// The library manager needs a full tab, not a 600px popup.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'ytc-classify') return undefined;
  classify(message.video)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));
  return true; // keep the sendResponse channel open for the async reply
});

async function classify(video) {
  if (!video?.id || !video.title) throw new Error('video needs id and title');
  const prefs = await getPreferences();

  const channel = (video.channel ?? '').trim().toLowerCase();
  if (channel && prefs.trustedChannels.some((c) => c.trim().toLowerCase() === channel)) {
    return { verdict: 'quality', confidence: 1, reason: 'Trusted channel', source: 'trusted' };
  }

  const title = video.title.toLowerCase();
  const keyword = prefs.blacklistKeywords.find(
    (k) => k.trim() && title.includes(k.trim().toLowerCase())
  );
  if (keyword) {
    return {
      verdict: 'slop',
      confidence: 1,
      reason: `Blacklisted keyword: ${keyword}`,
      source: 'blacklist',
    };
  }

  const cached = await getCachedClassification(video.id);
  if (cached) {
    return {
      verdict: cached.verdict,
      confidence: cached.confidence,
      reason: cached.reason,
      source: 'cache',
    };
  }

  const result = await enqueueLLM(() => classifyWithLLM(video));
  await putCachedClassification({
    videoId: video.id,
    title: video.title,
    channel: video.channel ?? '',
    verdict: result.verdict,
    confidence: result.confidence,
    reason: result.reason,
    classifiedAt: new Date().toISOString(),
  });
  return { ...result, source: 'llm' };
}

function getPreferences() {
  // Mirrored into chrome.storage.local by src/storage/preferences.js
  // (the app page itself uses localStorage, which workers can't read).
  return chrome.storage.local
    .get(PREFS_KEY)
    .then((stored) => ({ ...DEFAULT_PREFERENCES, ...(stored?.[PREFS_KEY] ?? {}) }))
    .catch(() => ({ ...DEFAULT_PREFERENCES }));
}

/* ---- Ollama ---- */

let llmQueue = Promise.resolve();

function enqueueLLM(fn) {
  const run = llmQueue.then(fn);
  llmQueue = run.catch(() => {}); // one failure must not poison the queue
  return run;
}

// Keep this prompt in sync with src/llm/ollamaClient.js.
function buildPrompt(video) {
  const channelLine = video.channel ? `\nChannel: ${video.channel}` : '';
  return (
    'You are a YouTube content quality classifier. Classify this video as exactly one of: quality, neutral, slop.\n\n' +
    `Title: "${video.title}"${channelLine}\n\n` +
    'Respond with JSON only: {"verdict": "quality|neutral|slop", "confidence": <0-1>, "reason": "<10 words max>"}'
  );
}

async function classifyWithLLM(video) {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      format: 'json',
      stream: false,
      options: { temperature: 0 },
      prompt: buildPrompt(video),
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
  };
}

/* ---- IndexedDB cache ---- */
// Same database as the app page. Keep names, version, and the upgrade logic
// in sync with src/db/database.js — either context may run the upgrade.

const DB_NAME = 'yt-curator';
const DB_VERSION = 2;
const VIDEO_STORE = 'videos';
const CLASSIFICATION_STORE = 'classifications';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(VIDEO_STORE)) {
        const store = db.createObjectStore(VIDEO_STORE, { keyPath: 'id' });
        store.createIndex('channel', 'channel', { unique: false });
        store.createIndex('savedAt', 'savedAt', { unique: false });
        store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
      }
      if (!db.objectStoreNames.contains(CLASSIFICATION_STORE)) {
        const store = db.createObjectStore(CLASSIFICATION_STORE, { keyPath: 'videoId' });
        store.createIndex('verdict', 'verdict', { unique: false });
        store.createIndex('classifiedAt', 'classifiedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

function withClassificationStore(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(CLASSIFICATION_STORE, mode);
        const request = fn(tx.objectStore(CLASSIFICATION_STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

function getCachedClassification(videoId) {
  // Cache failures should not block classification.
  return withClassificationStore('readonly', (store) => store.get(videoId)).catch(() => null);
}

function putCachedClassification(entry) {
  return withClassificationStore('readwrite', (store) => store.put(entry)).catch(() => {});
}

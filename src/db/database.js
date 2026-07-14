// IndexedDB layer for the video library.
// All functions return Promises. Video shape:
// { id, url, title, channel, tags: string[], savedAt: ISO string, notes }

// Keep names, version, and upgrade logic in sync with public/background.js —
// the service worker opens the same database and either context may run the
// upgrade.
const DB_NAME = 'yt-curator';
const DB_VERSION = 2;
const VIDEO_STORE = 'videos';
const CLASSIFICATION_STORE = 'classifications';

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      // Future modules (discovery, analytics) add their own stores here
      // under a bumped DB_VERSION.
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

function withStore(storeName, mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = fn(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

export function addVideo(video) {
  const record = {
    id: video.id ?? crypto.randomUUID(),
    url: video.url ?? '',
    title: video.title ?? '',
    channel: video.channel ?? '',
    tags: video.tags ?? [],
    savedAt: video.savedAt ?? new Date().toISOString(),
    notes: video.notes ?? '',
  };
  return withStore(VIDEO_STORE, 'readwrite', (store) => store.add(record)).then(() => record);
}

export function updateVideo(video) {
  return withStore(VIDEO_STORE, 'readwrite', (store) => store.put(video)).then(() => video);
}

export function deleteVideo(id) {
  return withStore(VIDEO_STORE, 'readwrite', (store) => store.delete(id));
}

export function getVideo(id) {
  return withStore(VIDEO_STORE, 'readonly', (store) => store.get(id));
}

export function getAllVideos() {
  return withStore(VIDEO_STORE, 'readonly', (store) => store.getAll());
}

export function clearAllVideos() {
  return withStore(VIDEO_STORE, 'readwrite', (store) => store.clear());
}

/* ---- Classification cache (written by public/background.js) ---- */
// Entry shape: { videoId, title, channel, verdict, confidence, reason, classifiedAt }

export function getAllClassifications() {
  return withStore(CLASSIFICATION_STORE, 'readonly', (store) => store.getAll());
}

export function clearClassifications() {
  return withStore(CLASSIFICATION_STORE, 'readwrite', (store) => store.clear());
}

/**
 * Search and filter the library. All criteria are optional and combined
 * with AND. In-memory filtering is fine at personal-library scale; swap
 * for index/cursor queries if libraries grow past a few thousand entries.
 *
 * @param {object} criteria
 * @param {string} [criteria.query] matched against title, channel, and tags
 * @param {string} [criteria.channel] exact channel match
 * @param {string[]} [criteria.tags] video must have every listed tag
 * @param {string} [criteria.from] ISO date, savedAt lower bound (inclusive)
 * @param {string} [criteria.to] ISO date, savedAt upper bound (inclusive)
 */
export async function searchVideos(criteria = {}) {
  const { query, channel, tags, from, to } = criteria;
  const all = await getAllVideos();
  const q = query?.trim().toLowerCase();

  return all.filter((video) => {
    if (q) {
      const haystack = [video.title, video.channel, ...(video.tags ?? [])]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (channel && video.channel !== channel) return false;
    if (tags?.length && !tags.every((t) => video.tags?.includes(t))) return false;
    if (from && video.savedAt < new Date(from).toISOString()) return false;
    if (to) {
      // Make the upper bound inclusive of the whole day.
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      if (video.savedAt > end.toISOString()) return false;
    }
    return true;
  });
}

export async function exportLibraryJSON() {
  const videos = await getAllVideos();
  return JSON.stringify({ exportedAt: new Date().toISOString(), videos }, null, 2);
}

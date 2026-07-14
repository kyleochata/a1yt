// User preferences live in localStorage (small, synchronous, survives
// extension reloads). The video library itself lives in IndexedDB.
//
// When running as an extension, preferences are additionally mirrored into
// chrome.storage.local: the service worker (background.js) and the YouTube
// content script can't read the app page's localStorage but need the
// trusted/blacklist/sensitivity values for filtering.
import { clearAllVideos, clearClassifications } from '../db/database.js';

const PREFS_KEY = 'ytc.preferences';

export const DEFAULT_PREFERENCES = {
  trustedChannels: [],
  blacklistKeywords: [],
  sensitivity: 50,
  filteringEnabled: true,
};

function mirrorToExtensionStorage(prefs) {
  try {
    globalThis.chrome?.storage?.local?.set({ [PREFS_KEY]: prefs });
  } catch {
    // Not running as an extension (npm run dev) — nothing to mirror.
  }
}

export function loadPreferences() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    // Merge so newly added preference keys get defaults on old data.
    const prefs = { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
    mirrorToExtensionStorage(prefs);
    return prefs;
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  mirrorToExtensionStorage(prefs);
  return prefs;
}

export function exportPreferencesJSON() {
  return JSON.stringify(loadPreferences(), null, 2);
}

/** Parse and persist imported preferences. Throws on invalid input. */
export function importPreferencesJSON(json) {
  const parsed = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Preferences file must contain a JSON object');
  }
  const prefs = {
    trustedChannels: Array.isArray(parsed.trustedChannels)
      ? parsed.trustedChannels.filter((c) => typeof c === 'string')
      : DEFAULT_PREFERENCES.trustedChannels,
    blacklistKeywords: Array.isArray(parsed.blacklistKeywords)
      ? parsed.blacklistKeywords.filter((k) => typeof k === 'string')
      : DEFAULT_PREFERENCES.blacklistKeywords,
    sensitivity:
      typeof parsed.sensitivity === 'number'
        ? Math.min(100, Math.max(0, parsed.sensitivity))
        : DEFAULT_PREFERENCES.sensitivity,
    filteringEnabled:
      typeof parsed.filteringEnabled === 'boolean'
        ? parsed.filteringEnabled
        : DEFAULT_PREFERENCES.filteringEnabled,
  };
  return savePreferences(prefs);
}

/** Wipe preferences, the video library, and the classification cache. */
export async function clearAllData() {
  localStorage.removeItem(PREFS_KEY);
  try {
    globalThis.chrome?.storage?.local?.remove(PREFS_KEY);
  } catch {
    // dev mode
  }
  await clearAllVideos();
  await clearClassifications();
}

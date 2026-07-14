// User preferences live in localStorage (small, synchronous, survives
// extension reloads). The video library itself lives in IndexedDB.
import { clearAllVideos } from '../db/database.js';

const PREFS_KEY = 'ytc.preferences';

export const DEFAULT_PREFERENCES = {
  trustedChannels: [],
  blacklistKeywords: [],
  sensitivity: 50,
};

export function loadPreferences() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    // Merge so newly added preference keys get defaults on old data.
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
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
  };
  return savePreferences(prefs);
}

/** Wipe preferences and the entire video library. */
export async function clearAllData() {
  localStorage.removeItem(PREFS_KEY);
  await clearAllVideos();
}
